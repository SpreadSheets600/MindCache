import json
import math
import subprocess

import numpy as np
from PIL import Image, ImageOps

FRAME_SIZE = 384
FRAME_INTERVAL = 5
FRAMES_PER_SEGMENT = 8
SEGMENT_SECONDS = FRAME_INTERVAL * FRAMES_PER_SEGMENT


def read_image(path):
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def video_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, check=True, timeout=30,
    )
    duration = float(json.loads(result.stdout)["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Video duration is invalid")
    return duration


def video_segments(path):
    duration = video_duration(path)
    for start in range(0, math.ceil(duration), SEGMENT_SECONDS):
        result = subprocess.run(
            ["ffmpeg", "-v", "error", "-protocol_whitelist", "file,pipe", "-ss", str(start), "-i", str(path),
             "-vf", f"fps=1/{FRAME_INTERVAL}:start_time=0,scale={FRAME_SIZE}:{FRAME_SIZE}:force_original_aspect_ratio=decrease,pad={FRAME_SIZE}:{FRAME_SIZE}:(ow-iw)/2:(oh-ih)/2",
             "-frames:v", str(FRAMES_PER_SEGMENT), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
            capture_output=True, check=True, timeout=120,
        )
        frame_bytes = FRAME_SIZE * FRAME_SIZE * 3
        if not result.stdout or len(result.stdout) % frame_bytes:
            raise ValueError("Video segment contains no complete frames")
        frames = np.frombuffer(result.stdout, dtype=np.uint8).reshape(-1, FRAME_SIZE, FRAME_SIZE, 3)
        yield start, min(start + SEGMENT_SECONDS, duration), frames
