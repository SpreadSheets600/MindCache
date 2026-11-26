import subprocess

import pytest
from PIL import Image

from app.services.visual_media import FRAME_SIZE, FRAMES_PER_SEGMENT, read_image, video_segments


def test_image_is_decoded_to_rgb(tmp_path):
    path = tmp_path / "image.png"
    Image.new("L", (12, 8), 128).save(path)
    image = read_image(path)
    assert image.mode == "RGB"
    assert image.size == (12, 8)


def test_video_is_decoded_in_bounded_timestamped_segments(tmp_path):
    path = tmp_path / "video.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x48:r=1:d=42",
         "-c:v", "mpeg4", str(path)],
        check=True, timeout=30,
    )
    segments = list(video_segments(path))
    assert [(start, end) for start, end, _ in segments] == [(0, 40), (40, 42)]
    assert all(0 < len(frames) <= FRAMES_PER_SEGMENT for _, _, frames in segments)
    assert all(frames.shape[1:] == (FRAME_SIZE, FRAME_SIZE, 3) for _, _, frames in segments)


def test_invalid_video_fails(tmp_path):
    path = tmp_path / "broken.mp4"
    path.write_bytes(b"not a video")
    with pytest.raises(subprocess.CalledProcessError):
        list(video_segments(path))
