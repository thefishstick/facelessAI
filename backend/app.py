from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import replicate
import asyncio
import time

app = Flask(__name__)
CORS(app)

REPLICATE_API_TOKEN = "r8_NqiTCDL7YA5yn9sHNM6zPIgeXNACIvh3M3i0f"# os.getenv("REPLICATE_API_TOKEN")
os.environ["REPLICATE_API_TOKEN"] = REPLICATE_API_TOKEN
# prefix_prompt = "in the style of an animated cinematic scene, vibrant colors, semi-realistic, dynamic lighting, soft shadows, expressive characters, high detail, Pixar meets Unreal Engine: "
prefix_prompt = "in a style that is hyper realistic, HD, real people: "

# Async wrapper for replicate.run
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

def generate_image_sync(prompt):
    prediction = replicate.predictions.create(
        version="black-forest-labs/flux-schnell",
        input={
            "prompt": prefix_prompt + prompt,
            "aspect_ratio": "9:16"
            # "scheduler": "K_EULER"
        }
    )

    # Poll until complete
    while prediction.status not in ["succeeded", "failed", "canceled"]:
        time.sleep(1)
        prediction.reload()

    if prediction.status == "succeeded":
        return prediction.output[0] if prediction.output else None
    return None

@app.route('/api/generate-images', methods=['POST'])
def generate_images_endpoint():
    data = request.get_json()
    script = data.get("script")

    if not script:
        return jsonify({"error": "No script provided"}), 400

    sentences = split_script_into_sentences(script)
    image_urls = [generate_image_sync(sentence) for sentence in sentences]

    return jsonify({
        "sentences": sentences,
        "images": image_urls
    })

@app.route('/api/hello')
def hello():
    return jsonify(message="Hello from Flask!")

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



if __name__ == '__main__':
    app.run(debug=True)
