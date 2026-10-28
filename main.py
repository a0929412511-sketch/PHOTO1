import re
from pathlib import Path

from flask import Flask, jsonify, render_template, send_from_directory, url_for

app = Flask(__name__, static_folder="static", template_folder="templates")
GALLERY_DIR = Path(__file__).resolve().parent / "img"


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/gallery")
def gallery():
    story_images = [
        path for path in GALLERY_DIR.glob("*.png")
        if re.match(r"^\d{2}-\d-", path.name)
    ]
    story_images.sort(key=lambda path: (int(path.name[:2]), int(path.name[3]), path.name.casefold()))
    return jsonify([
        {
            "src": url_for("gallery_image", filename=path.name),
            "title": re.sub(r"^\d{2}-\d-", "", path.stem).replace("_", " "),
            "alt": re.sub(r"^\d{2}-\d-", "", path.stem).replace("_", " "),
        }
        for path in story_images
    ])


@app.get("/gallery/<path:filename>")
def gallery_image(filename):
    return send_from_directory(GALLERY_DIR, filename)
