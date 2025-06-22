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
from math import ceil 


# Monkey patch for Pillow 10+ compatibility with moviepy
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.Resampling.LANCZOS


app = Flask(__name__)
# CORS(app, resources={r"/api/*": {"origins": "*"}})
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

PARSE_APP_ID   = "fbx073HSS6fh9I8UqbpOY71ym5AgMSDh2SoPZQxq"
PARSE_REST_KEY = "kHqh0AHHdiH4AbrxjcktTaghWftJb34HoZFejxMA"
if not PARSE_APP_ID or not PARSE_REST_KEY:
    raise RuntimeError("❌  Set PARSE_APP_ID and PARSE_REST_KEY environment variables")



# Set Replicate API token
REPLICATE_API_TOKEN = "r8_AwMoZ9tb4O6H9ZF" + "cd7ituMcv5gfnN1E1Zwf4z"
os.environ["REPLICATE_API_TOKEN"] = REPLICATE_API_TOKEN

# Prompt style prefix
# prefix_prompt = (
#     "in the style of an animated cinematic scene, vibrant colors, semi-realistic, "
#     "dynamic lighting, soft shadows, expressive characters, high detail, Pixar meets Unreal Engine: "
# )

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
def generate_image_sync(args):
    """
    args → (style_prompt, sentence)
    Builds:  "<style_prompt>: <sentence>"
    Then prepends your global `prefix_prompt` string
    before sending to Replicate.
    """
    style_prompt, sentence = args
    styled_sentence = f" {sentence} {style_prompt}:" if style_prompt else sentence

    # final prompt seen by the model
    full_prompt = styled_sentence

    prediction = replicate.predictions.create(
        version="black-forest-labs/flux-schnell",
        input={
            "prompt":         full_prompt,
            "aspect_ratio":   "9:16",
            "output_quality": 80
        }
    )

    while prediction.status not in ("succeeded", "failed", "canceled"):
        time.sleep(1)
        prediction.reload()

    return prediction.output[0] if prediction.status == "succeeded" and prediction.output else None

# ──────────────────────────────────────────────────────────────────────────────
#  /api/compile-video
#  – starts a render job
#  – immediately stores a “pending” row in Back4App (Videos table)
#  – updates that row when the render finishes / fails
# ──────────────────────────────────────────────────────────────────────────────
# ---------------------------------------------------------------------
#  /api/compile-video
# ---------------------------------------------------------------------
# ---------------------------------------------------------------------
#  /api/compile-video
# ---------------------------------------------------------------------
@app.route('/api/compile-video', methods=['POST'])
def start_compile_video_job():
    data = request.get_json()

    # ---------- validate -------------------------------------------------
    required = ["user_id", "prompt", "style_prompt",
                "script", "images", "audio_urls"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    user_id      = data["user_id"]
    prompt       = data["prompt"]
    style_prompt = data["style_prompt"]
    script       = data["script"]
    images       = data["images"]
    audio_urls   = data["audio_urls"]

    if len(images) != len(audio_urls):
        return jsonify({"error": "images and audio_urls length mismatch"}), 400

    # ---------- create “job” in memory -----------------------------------
    job_id = str(uuid.uuid4())
    video_jobs[job_id] = {"status": "pending", "video_url": None, "error": None}
    print(f"🎬 [JOB {job_id}] Started")

    # ---------- create Back4App row (pending) ----------------------------
    BA_HEADERS = {
        "X-Parse-Application-Id": PARSE_APP_ID,
        "X-Parse-REST-API-Key" : PARSE_REST_KEY,
        "Content-Type"         : "application/json"
    }
    object_id = None
    try:
        resp = requests.post(
            "https://parseapi.back4app.com/classes/Videos",
            headers=BA_HEADERS,
            json={
                "user_id"     : user_id,
                "prompt"      : prompt,
                "style"       : style_prompt,
                "video_id"    : job_id,
                "video_status": "pending"
            },
            timeout=15
        )
        resp.raise_for_status()
        object_id = resp.json()["objectId"]
        print(f"📚 Back4App row created → {object_id}")
    except Exception as err:
        print("⚠️  Could not create Back4App row:", err)

    # ---------- background worker ---------------------------------------
    def run_compile():
        try:
            temp_dir = f"/tmp/{job_id}"
            os.makedirs(temp_dir, exist_ok=True)

            # ── 1. build per-scene clips (Ken-Burns zoom) ─────────────────
            scene_files = []
            for idx, (img_url, v_url) in enumerate(zip(images, audio_urls)):
                print(f"   ↳ Scene {idx+1}/{len(images)}")
                img_path   = os.path.join(temp_dir, f"img_{idx}.jpg")
                voice_path = os.path.join(temp_dir, f"voice_{idx}.mp3")
                clip_path  = os.path.join(temp_dir, f"clip_{idx}.mp4")

                with open(img_path,   "wb") as f: f.write(requests.get(img_url).content)
                with open(voice_path, "wb") as f: f.write(requests.get(v_url).content)

                audio     = AudioFileClip(voice_path)
                duration  = audio.duration
                base      = ImageClip(img_path)

                TW, TH  = 1080, 1920
                w, h    = base.size
                scale0  = (TH/h) if w/h > TW/TH else (TW/w)
                zoom    = lambda t: scale0 * (1 + 0.10 * t / duration)

                clip = (base
                        .resize(zoom)
                        .crop(x_center=TW/2, y_center=TH/2, width=TW, height=TH)
                        .set_duration(duration)
                        .set_audio(audio)
                        .set_fps(30)
                        .fadein(0.4).fadeout(0.4))
                clip.write_videofile(
                    clip_path, codec="libx264", audio_codec="aac",
                    verbose=False, logger=None
                )
                scene_files.append(clip_path)

            # ── 2. concatenate scenes ────────────────────────────────────
            final_raw = os.path.join(temp_dir, "final_raw.mp4")
            concatenate_videoclips(
                [VideoFileClip(p) for p in scene_files],
                method="compose"
            ).write_videofile(
                final_raw, codec="libx264", audio_codec="aac",
                verbose=False, logger=None
            )


            # ── ✨ NEW – get whole video length ✨ ────────────────────────
            _tmp_clip   = VideoFileClip(final_raw)
            vid_seconds = ceil(_tmp_clip.duration)      # int seconds
            _tmp_clip.close()

            raw_s3_url = uploadAnyFile2S3(final_raw, f"{job_id}_raw")
            print("☁️  Raw video uploaded")

            # ── 3. call Replicate (captions + music) in parallel ─────────
            def call_captions():
                return replicate.run(
                    "fictions-ai/autocaption:18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b",
                    input={
                        "video_file_input" : raw_s3_url,
                        "output_video"     : True,
                        "output_transcript": False,
                        "font"             : "Poppins/Poppins-ExtraBold.ttf",
                        "fontsize"         : 5,
                        "MaxChars"         : 26,
                        "color"            : "white",
                        "stroke_color"     : "black",
                        "stroke_width"     : 2.6,
                        "subs_position"    : "bottom75",
                        "highlight_color"  : "yellow",
                        "kerning"          : -5,
                        "opacity"          : 0
                    }
                )

            def call_music():
                return replicate.run(
                    "ardianfe/music-gen-fn-200e:96af46316252ddea4c6614e31861876183b59dce84bad765f38424e87919dd85",
                    input={
                        "prompt"                : "chill music with construction vibes sound behind, dominant acoustic guitar & piano",
                        "duration"              : vid_seconds,
                        "top_k"                 : 250,
                        "temperature"           : 1,
                        "output_format"         : "wav",
                        "continuation"          : False,
                        "multi_band_diffusion"  : False,
                        "normalization_strategy": "loudness",
                        "classifier_free_guidance": 3
                    }
                )

            with ThreadPoolExecutor(max_workers=2) as ex:
                cap_out, music_out = ex.submit(call_captions), ex.submit(call_music)
                cap_out   = cap_out.result()
                music_out = music_out.result()

            # ── 4. download outputs ─────────────────────────────────────
            cap_url   = cap_out[0]   if isinstance(cap_out,   list) else cap_out
            music_url = music_out[0] if isinstance(music_out, list) else music_out

            cap_path   = os.path.join(temp_dir, "captioned.mp4")
            music_path = os.path.join(temp_dir, "bg_music.wav")

            for url, local in ((cap_url, cap_path), (music_url, music_path)):
                r = requests.get(url, timeout=60)
                r.raise_for_status()
                with open(local, "wb") as f:
                    f.write(r.content)

            # ── 5. merge bg-music with captioned video ──────────────────
            print("🎧 Merging background music …")
            vid  = VideoFileClip(cap_path)
            mus  = AudioFileClip(music_path).volumex(0.10).set_duration(vid.duration)

            final_audio = CompositeAudioClip([vid.audio, mus])
            vid_final   = vid.set_audio(final_audio)

            final_full = os.path.join(temp_dir, "final_captioned_music.mp4")
            vid_final.write_videofile(
                final_full,
                codec="libx264",
                audio_codec="aac",
                bitrate="3M",
                verbose=False,
                logger=None
            )

            # ── 6. upload + update state --------------------------------
            final_url = uploadAnyFile2S3(final_full, f"final_{job_id}")
            video_jobs[job_id] = {
                "status"   : "done",
                "video_url": final_url,
                "error"    : None
            }

            if object_id:
                requests.put(
                    f"https://parseapi.back4app.com/classes/Videos/{object_id}",
                    headers=BA_HEADERS,
                    json={
                        "video_url"   : final_url,
                        "video_status": "completed"
                    },
                    timeout=15
                )

            print(f"✅ [JOB {job_id}] Done")

        except Exception as e:
            print(f"🔥 [JOB {job_id}] Error:", e)
            video_jobs[job_id] = {"status": "error", "video_url": None, "error": str(e)}

            if object_id:
                requests.put(
                    f"https://parseapi.back4app.com/classes/Videos/{object_id}",
                    headers=BA_HEADERS,
                    json={
                        "video_status": "error",
                        "error_msg"   : str(e)[:250]
                    },
                    timeout=15
                )

    threading.Thread(target=run_compile, daemon=True).start()
    return jsonify({"job_id": job_id}), 202

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
    payload      = request.get_json()
    script       = payload.get("script")
    style_prompt = (payload.get("style_prompt") or "").strip()   # may be empty

    print("STYLE TAGGGGS:", style_prompt)

    if not script:
        return jsonify({"error": "No script provided"}), 400

    sentences = split_script_into_sentences(script)

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status"   : "pending",
        "sentences": sentences,   # keep originals for the UI
        "images"   : []
    }

    def run_generation():
        try:
            # ↳ build an iterable of (style_prompt, sentence) tuples
            tasks  = [(style_prompt, s) for s in sentences]

            with ThreadPoolExecutor(max_workers=4) as ex:
                imgs = list(ex.map(generate_image_sync, tasks))

            jobs[job_id]["images"] = imgs
            jobs[job_id]["status"] = "done"
        except Exception as exc:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"]  = str(exc)

    threading.Thread(target=run_generation, daemon=True).start()
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

    txt = "Please generate a short, simple 3-4 sentence story or tutorial about the following prompt. Make sure each sentence has some specific, unique content, and ties to the overall story/prompt. Don't use quotes or speech. The tone is like a social media video narrator. Use short sentences and very simple language. If you are asked to describe something fictional, do not mention it is fictional. Pretend it is real. Here is the prompt: "
    txt_and_prompt = txt + prompt

    if not txt_and_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    input = {
        "prompt": txt_and_prompt,
        "system_prompt": "You are a helpful tool"
    }

    try:
        full_response = ""
        for event in replicate.stream("openai/gpt-4o", input=input):
            full_response += str(event)
        return jsonify({"script": full_response})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/fetchStyles", methods=["GET"])
def fetch_styles():
    """
    GET /api/fetchStyles
    Returns: { "styles": [ {...}, {...} ] }  or  { "error": "..."}
    """
    try:
        url = "https://parseapi.back4app.com/classes/Styles"
        headers = {
            "X-Parse-Application-Id": PARSE_APP_ID,
            "X-Parse-REST-API-Key" : PARSE_REST_KEY,
            "Content-Type"         : "application/json"
        }

        # if you have >100 records you can use limit / skip or order parameters
        # see: https://docs.parseplatform.org/rest/guide/#objects
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()            # raises for 4xx / 5xx

        data = resp.json().get("results", [])
        return jsonify({ "styles": data })

    except requests.exceptions.RequestException as err:
        # network / API errors
        return jsonify({ "error": f"Unable to reach Back4App: {err}" }), 502
    except Exception as err:
        # anything else
        return jsonify({ "error": str(err) }), 500
    
@app.route("/api/fetchNarrators", methods=["GET"])
def fetch_narrators():
    """
    GET /api/fetchStyles
    Returns: { "styles": [ {...}, {...} ] }  or  { "error": "..."}
    """
    try:
        url = "https://parseapi.back4app.com/classes/Narrators"
        headers = {
            "X-Parse-Application-Id": PARSE_APP_ID,
            "X-Parse-REST-API-Key" : PARSE_REST_KEY,
            "Content-Type"         : "application/json"
        }

        # if you have >100 records you can use limit / skip or order parameters
        # see: https://docs.parseplatform.org/rest/guide/#objects
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()            # raises for 4xx / 5xx

        data = resp.json().get("results", [])
        return jsonify({ "narrators": data })

    except requests.exceptions.RequestException as err:
        # network / API errors
        return jsonify({ "error": f"Unable to reach Back4App: {err}" }), 502
    except Exception as err:
        # anything else
        return jsonify({ "error": str(err) }), 500

import json
@app.route("/api/fetchVideos", methods=["POST"])
def fetch_videos():
    payload   = request.get_json(silent=True) or {}
    user_id   = payload.get("user_id", "").strip()

    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        url = "https://parseapi.back4app.com/classes/Videos"
        headers = {
            "X-Parse-Application-Id": PARSE_APP_ID,
            "X-Parse-REST-API-Key" : PARSE_REST_KEY,
            "Content-Type"         : "application/json"
        }

        # Build Parse “where” clause:
        # { user_id: "<id>", video_status: { $in: ["pending","completed"] } }
        where = {
            "user_id"     : user_id,
            "video_status": { "$in": ["pending", "completed"] }
        }

        resp = requests.get(
            url,
            headers=headers,
            params={ "where": json.dumps(where), "order": "-createdAt" },
            timeout=15
        )
        resp.raise_for_status()

        return jsonify({ "videos": resp.json().get("results", []) })

    except requests.exceptions.RequestException as err:
        return jsonify({ "error": f"Unable to reach Back4App: {err}" }), 502
    except Exception as err:
        return jsonify({ "error": str(err) }), 500
    
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

@app.route("/api/regenerate-image", methods=["POST"])
def regenerate_image():
    """
    Body: { "text": "<edited sentence>",
            "style_prompt": "<optional style prefix>" }

    Returns: { "image_url": "https://…" }  or  { "error": "…" }
    """
    payload       = request.get_json(silent=True) or {}
    text          = (payload.get("text") or "").strip()
    style_prompt  = (payload.get("style_prompt") or "").strip()

    if not text:
        return jsonify({"error": "text required"}), 400

    try:
        # build "<style>: <sentence>"  (or just sentence)
        final_prompt = f"{style_prompt}: {text}" if style_prompt else text

        # --- call Replicate synchronously ---
        pred = replicate.predictions.create(
            version="black-forest-labs/flux-schnell",
            input={
                "prompt"        : final_prompt,
                "aspect_ratio"  : "9:16",
                "output_quality": 80
            }
        )
        while pred.status not in ("succeeded", "failed", "canceled"):
            time.sleep(1)
            pred.reload()

        if pred.status != "succeeded" or not pred.output:
            raise RuntimeError("Replicate failed")

        return jsonify({"image_url": pred.output[0]})

    except Exception as err:
        return jsonify({"error": str(err)}), 500


@app.route("/api/regenerate-audio", methods=["POST"])
def regenerate_audio():
    """
    Body: { "text": "<edited narrator text>" }

    Returns: { "audio_url": "https://…" }  or  { "error": "…" }
    """
    payload = request.get_json(silent=True) or {}
    text    = (payload.get("text") or "").strip()

    if not text:
        return jsonify({"error": "text required"}), 400

    try:
        out = replicate.run(
            "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13",
            input={
                "text" : text,
                "speed": 1,
                "voice": "af_alloy"
            }
        )
        return jsonify({"audio_url": str(out)})

    except Exception as err:
        return jsonify({"error": str(err)}), 500

# Basic health check
@app.route('/api/hello')
def hello():
    return jsonify(message="Hello from Flask!")

if __name__ == '__main__':
    app.run(debug=True)
