from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import replicate
import time
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

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

# GET to poll image status
@app.route('/api/image-status/<job_id>', methods=['GET'])
def check_image_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Invalid job ID"}), 404
    return jsonify(job)

# Script generation using GPT-4o
@app.route('/api/generate-script', methods=['POST'])
def generate_script():
    data = request.get_json()
    prompt = data.get("prompt")

    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    input = {
        "prompt": prompt,
        "system_prompt": "You are a helpful tool that writes 5-7 sentence small tutorials/instructions. The tone is like a social media video narrator. Use short sentences and very simple language. They can be historical or fictional, depending on the prompt you are asked."
    }

    try:
        full_response = ""
        for event in replicate.stream("openai/gpt-4o", input=input):
            full_response += str(event)
        return jsonify({"script": full_response})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Basic health check
@app.route('/api/hello')
def hello():
    return jsonify(message="Hello from Flask!")

if __name__ == '__main__':
    app.run(debug=True)
