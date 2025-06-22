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
from moviepy.audio.AudioClip import CompositeAudioClip
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
            "aspect_ratio": "9:16",
            "output_quality": 80
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
    data       = request.get_json()
    script     = data.get("script")
    images     = data.get("images")
    audio_urls = data.get("audio_urls")

    if not script or not images or not audio_urls:
        return jsonify({"error": "script, images, and audio_urls are required"}), 400

    job_id = str(uuid.uuid4())
    video_jobs[job_id] = {"status": "pending", "video_url": None, "error": None}
    print(f"🎬 [JOB {job_id}] Started")

    # ---------- threaded worker ----------
    def run_compile():
        try:
            temp_dir = f"/tmp/{job_id}"
            os.makedirs(temp_dir, exist_ok=True)

            # ------------------------------------------------------------------
            # 1)  Build each (image + voice-over) scene with a slow zoom effect
            # ------------------------------------------------------------------
            scene_paths = []
            for idx, (img_url, voice_url) in enumerate(zip(images, audio_urls)):
                print(f"   ↳ Scene {idx+1}/{len(images)} – downloading assets")
                img_path   = os.path.join(temp_dir, f"img_{idx}.jpg")
                voice_path = os.path.join(temp_dir, f"voice_{idx}.mp3")
                clip_path  = os.path.join(temp_dir, f"clip_{idx}.mp4")

                with open(img_path,   "wb") as f: f.write(requests.get(img_url).content)
                with open(voice_path, "wb") as f: f.write(requests.get(voice_url).content)

                audio    = AudioFileClip(voice_path)
                duration = audio.duration
                base     = ImageClip(img_path)

                # --- scale & zoom (Ken-Burns) ---
                TARGET_W, TARGET_H = 1080, 1920
                w, h = base.size
                scale0 = (TARGET_H / h) if w/h > TARGET_W/TARGET_H else (TARGET_W / w)
                def zoom(t):       # 10 % zoom-in over clip
                    return scale0 * (1 + 0.10 * t / duration)

                clip = (
                    base
                      .resize(zoom)                                  # dynamic resize
                      .crop(x_center=TARGET_W/2, y_center=TARGET_H/2,
                            width=TARGET_W, height=TARGET_H)         # 9:16 crop
                      .set_duration(duration)
                      .set_audio(audio)
                      .set_fps(30)
                      .fadein(0.4)
                      .fadeout(0.4)
                )
                clip.write_videofile(clip_path, codec="libx264",
                                     audio_codec="aac",
                                     verbose=False, logger=None)
                scene_paths.append(clip_path)

            # ------------------------------------------------------------------
            # 2)  Concatenate scenes
            # ------------------------------------------------------------------
            print("🔗 Concatenating scenes …")
            final_raw = os.path.join(temp_dir, "final_raw.mp4")
            concatenate_videoclips(
                [VideoFileClip(p) for p in scene_paths],
                method="compose"
            ).write_videofile(final_raw, codec="libx264", audio_codec="aac",
                              verbose=False, logger=None)

            # ------------------------------------------------------------------
            # 3)  Upload raw video → S3 (Replicate needs https)
            # ------------------------------------------------------------------
            video_s3_url = uploadAnyFile2S3(final_raw, f"{job_id}_raw")
            print("☁️  Uploaded raw video to S3")

            # ------------------------------------------------------------------
            # 4)  Kick off *both* captioning & music-gen in parallel
            # ------------------------------------------------------------------
            print("📝 Sending to Replicate – captions & bg-music")
            def call_captions():
                return replicate.run(
                    "fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b",
                    input={
                        "video_file_input": video_s3_url,
                        "output_video":     True,
                        "output_transcript": False,
                        "font": "Poppins/Poppins-ExtraBold.ttf",
                        "fontsize": 4,
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

            def call_music():
                return replicate.run(
                    "ardianfe/music-gen-fn-200e:96af46316252ddea4c6614e31861876183b59dce84bad765f38424e87919dd85",
                    input={
                        "prompt": "chill music with construction vibes sound behind, dominant in acoustic guitar and piano",
                        "duration": 60,
                        "top_k": 250,
                        "top_p": 0,
                        "temperature": 1,
                        "continuation": False,
                        "output_format": "wav",
                        "multi_band_diffusion": False,
                        "normalization_strategy": "loudness",
                        "classifier_free_guidance": 3
                    }
                )

            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=2) as ex:
                future_captions = ex.submit(call_captions)
                future_music    = ex.submit(call_music)

                caption_out = future_captions.result()
                music_out   = future_music.result()

            # ----- download captioned video -----
            cap_url = caption_out[0] if isinstance(caption_out, list) else caption_out
            cap_path = os.path.join(temp_dir, "captioned.mp4")
            with open(cap_path, "wb") as f:
                f.write(requests.get(cap_url).content)

            # ----- download bg-music wav -----
            music_url = music_out[0] if isinstance(music_out, list) else music_out
            music_path = os.path.join(temp_dir, "bg_music.wav")
            with open(music_path, "wb") as f:
                f.write(requests.get(music_url).content)

            # ------------------------------------------------------------------
            # 5)  Merge music with captioned video
            # ------------------------------------------------------------------
            print("🎧 Merging background music …")
            vid  = VideoFileClip(cap_path)
            mus  = AudioFileClip(music_path).volumex(0.3)          # softer music
            final_audio = CompositeAudioClip([vid.audio, mus.set_duration(vid.duration)])
            vid_final   = vid.set_audio(final_audio)

            final_full = os.path.join(temp_dir, "final_captioned_music.mp4")
            vid_final.write_videofile(final_full, codec="libx264", audio_codec="aac",
                                      bitrate="3M", verbose=False, logger=None)

            # ------------------------------------------------------------------
            # 6)  Upload finished asset
            # ------------------------------------------------------------------
            final_url = uploadAnyFile2S3(final_full, f"final_{job_id}")
            print(f"✅ [JOB {job_id}] Done → {final_url}")

            video_jobs[job_id] = {"status": "done", "video_url": final_url, "error": None}

        except Exception as e:
            print(f"🔥 [JOB {job_id}] Error:", e)
            video_jobs[job_id] = {"status": "error", "video_url": None, "error": str(e)}

    threading.Thread(target=run_compile, daemon=True).start()
    return jsonify({"job_id": job_id})


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
        "system_prompt": "You are a helpful tool that writes 1-2 sentence tiny, small tutorials/instructions. The tone is like a social media video narrator. Use short sentences and very simple language. They can be historical or fictional, depending on the prompt you are asked."
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
