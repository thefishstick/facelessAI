from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import replicate
import time
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests
import boto3
import uuid
import os
from moviepy.editor import AudioFileClip, ImageClip, VideoFileClip
from moviepy.editor import concatenate_videoclips
from flask import request, jsonify
import urllib.parse
from PIL import Image

# Monkey patch for Pillow 10+ compatibility with moviepy
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS


app = Flask(__name__)
CORS(app)


# Set your S3 credentials and bucket

AMAZON_ID = "AKIA4YBNZUUYG27PNW6F"
AMAZON_KEY = "q3YE6yR7ljqCb0VEX344YvuTVKIno9vxs1RJKUZJ"
S3_BUCKET = "nftgo-bucket"

s3_client = boto3.client(
    's3',
    aws_access_key_id=AMAZON_ID,
    aws_secret_access_key=AMAZON_KEY
)


# Set Replicate API token
REPLICATE_API_TOKEN = "r8_NqiTCDL7YA5yn9sHNM6zPIgeXNACIvh3M3i0f"
os.environ["REPLICATE_API_TOKEN"] = REPLICATE_API_TOKEN

# Prompt style prefix
prefix_prompt = (
    "in the style of an animated cinematic scene, vibrant colors, semi-realistic, "
    "dynamic lighting, soft shadows, expressive characters, high detail, Pixar meets Unreal Engine: "
)

# In-memory job store
jobs = {}
video_jobs = {} 

def uploadAnyFile2S3(path, unique_id):
    _, extension = os.path.splitext(path)
    object_name = 'public/' + unique_id + extension
    s3_client.upload_file(path, S3_BUCKET, object_name)
    return "https://" + S3_BUCKET + ".s3.us-east-2.amazonaws.com/" + urllib.parse.quote_plus(object_name)

# Sentence splitter
def split_script_into_sentences(script):
    sentence_endings = ['.', '!', '?']
    sentences = []
    current = ''

    for char in script:
        current += char
        if char in sentence_endings:
            sentences.append(current.strip())
            current = ''
    if current.strip():
        sentences.append(current.strip())

    return sentences

# Blocking synchronous image generation
def generate_image_sync(prompt):
    prediction = replicate.predictions.create(
        version="black-forest-labs/flux-schnell",
        input={
            "prompt": prefix_prompt + prompt,
            "aspect_ratio": "9:16"
        }
    )

    while prediction.status not in ["succeeded", "failed", "canceled"]:
        time.sleep(1)
        prediction.reload()

    if prediction.status == "succeeded":
        return prediction.output[0] if prediction.output else None
    return None

@app.route('/api/compile-video', methods=['POST'])
def start_compile_video_job():
    data = request.get_json()
    script = data.get("script")
    images = data.get("images")
    audio_urls = data.get("audio_urls")

    if not script or not images or not audio_urls:
        return jsonify({"error": "script, images, and audio_urls are required"}), 400

    job_id = str(uuid.uuid4())
    video_jobs[job_id] = { "status": "pending", "video_url": None, "error": None }

    def run_compile():
        try:
            temp_dir = f"/tmp/{job_id}"
            os.makedirs(temp_dir, exist_ok=True)

            video_clips = []

            for idx, (img_url, audio_url) in enumerate(zip(images, audio_urls)):
                img_path = os.path.join(temp_dir, f"img_{idx}.jpg")
                audio_path = os.path.join(temp_dir, f"audio_{idx}.mp3")
                clip_path = os.path.join(temp_dir, f"clip_{idx}.mp4")

                with open(img_path, "wb") as f:
                    f.write(requests.get(img_url).content)
                with open(audio_path, "wb") as f:
                    f.write(requests.get(audio_url).content)

                audio = AudioFileClip(audio_path)
                duration = audio.duration

                clip = (
                    ImageClip(img_path)
                    .set_duration(duration)
                    .set_audio(audio)
                    .set_fps(30)
                    .resize(height=1920)
                    .fadein(0.5)
                    .fadeout(0.5)
                )

                clip.write_videofile(clip_path, codec="libx264", audio_codec="aac", verbose=False, logger=None)
                video_clips.append(clip_path)

            # Concatenate all sub-clips
            final_video_path = os.path.join(temp_dir, "final_output.mp4")
            clips = [VideoFileClip(p) for p in video_clips]
            final = concatenate_videoclips(clips, method="compose")
            final.write_videofile(final_video_path, codec="libx264", audio_codec="aac", verbose=False, logger=None)

            # Upload final video to S3 for Replicate access
            replicate_url = uploadAnyFile2S3(final_video_path, f"final_{job_id}_raw")
            print("replicate_url:", replicate_url)

            # Write transcript file to disk
            transcript_path = os.path.join(temp_dir, "transcript.txt")
            with open(transcript_path, "w", encoding="utf-8") as f:
                for line in split_script_into_sentences(script):
                    f.write(line + "\n")

            # Upload transcript to S3
            transcript_url = uploadAnyFile2S3(transcript_path, f"{job_id}_transcript")

            # Add captions via Replicate autocaption model
            captioned_output = replicate.run(
                "fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b",
                input={
                    "video_file_input": replicate_url,
                    # "transcript_file_input": transcript_url,
                    "output_video": True,
                    "output_transcript": False,
                    "font": "Poppins/Poppins-ExtraBold.ttf",
                    "fontsize": 5,
                    "MaxChars": 26,
                    "color": "white",
                    "stroke_color": "black",
                    "stroke_width": 2.6,
                    "subs_position": "bottom75",
                    "highlight_color": "yellow",
                    "kerning": -5,
                    "opacity": 0
                }
            )

            # Save captioned video locally
            captioned_url = captioned_output[0]
            response = requests.get(captioned_url)
            
            captioned_video_path = os.path.join(temp_dir, "final_captioned.mp4")
            with open(captioned_video_path, "wb") as f:
                f.write(response.content)

            # Upload final captioned video to S3
            final_url = uploadAnyFile2S3(captioned_video_path, f"final_{job_id}_captioned")

            video_jobs[job_id] = { "status": "done", "video_url": final_url, "error": None }

        except Exception as e:
            print("🔥 Error compiling video:", str(e))
            video_jobs[job_id] = { "status": "error", "video_url": None, "error": str(e) }

    threading.Thread(target=run_compile).start()
    return jsonify({ "job_id": job_id })

@app.route('/api/video-status/<job_id>', methods=['GET'])
def check_video_status(job_id):
    job = video_jobs.get(job_id)
    if not job:
        return jsonify({ "error": "Invalid job ID" }), 404
    return jsonify(job)

@app.route('/api/combine-audio-image', methods=['POST'])
def combine_audio_image():
    data = request.get_json()
    audio_url = data.get("audio_url")
    image_url = data.get("image_url")

    if not audio_url or not image_url:
        return jsonify({"error": "audio_url and image_url are required"}), 400

    try:
        job_id = str(uuid.uuid4())
        audio_path = f"/tmp/{job_id}.mp3"
        image_path = f"/tmp/{job_id}.jpg"
        video_path = f"/tmp/{job_id}.mp4"

        # Download files
        with open(audio_path, "wb") as f:
            f.write(requests.get(audio_url).content)
        with open(image_path, "wb") as f:
            f.write(requests.get(image_url).content)

        # Use MoviePy to combine
        audio = AudioFileClip(audio_path)
        duration = audio.duration

        video = (
            ImageClip(image_path)
            .set_duration(duration)
            .set_audio(audio)
            .set_fps(30)
            .resize(height=1920)  # or maintain native resolution
        )
        video.write_videofile(video_path, codec='libx264', audio_codec='aac')

        # Upload to S3
        video_url = uploadAnyFile2S3(video_path, job_id)

        return jsonify({"video_url": video_url})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# POST to start image generation
@app.route('/api/generate-images', methods=['POST'])
def generate_images_async():
    data = request.get_json()
    script = data.get("script")

    if not script:
        return jsonify({"error": "No script provided"}), 400

    sentences = split_script_into_sentences(script)
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "sentences": sentences, "images": []}

    def run_generation():
        with ThreadPoolExecutor(max_workers=4) as executor:
            images = list(executor.map(generate_image_sync, sentences))
        jobs[job_id]["images"] = images
        jobs[job_id]["status"] = "done"

    threading.Thread(target=run_generation).start()

    return jsonify({"job_id": job_id})

@app.route('/api/image-status/<job_id>', methods=['GET'])
def check_image_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Invalid job ID"}), 404

    if job["status"] != "done":
        return jsonify({"status": "pending"})

    return jsonify({
        "status": "done",
        "sentences": job["sentences"],
        "images": job["images"]
    })

# Script generation using GPT-4o
@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    data = request.get_json()
    prompt = data.get("prompt")

    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    input = {
        "prompt": prompt,
        "system_prompt": "You are a helpful tool that writes 4-5 sentence tiny, small tutorials/instructions. The tone is like a social media video narrator. Use short sentences and very simple language. They can be historical or fictional, depending on the prompt you are asked."
    }

    try:
        full_response = ""
        for event in replicate.stream("openai/gpt-4o", input=input):
            full_response += str(event)
        return jsonify({"script": full_response})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate-audio', methods=['POST'])
def generate_audio():
    data = request.get_json()
    text = data.get("text")

    if not text:
        print("❌ No text provided")
        return jsonify({"error": "No text provided"}), 400

    print(f"🔊 Generating audio for text: {text}")

    try:
        output = replicate.run(
            "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13",
            input={
                "text": text,
                "speed": 1,
                "voice": "af_alloy"
            }
        )

        # print("✅ Raw output from Replicate:", output)

        # Return it directly — it's a string
        return jsonify({ "audio_url": str(output) })

    except Exception as e:
        print("🔥 Error generating audio:", str(e))
        return jsonify({"error": str(e)}), 500

# Basic health check
@app.route('/api/hello')
def hello():
    return jsonify(message="Hello from Flask!")

if __name__ == '__main__':
    app.run(debug=True)
