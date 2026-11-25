import shutil
import subprocess


def recognize_image(data: bytes):
    executable = shutil.which("tesseract")
    if not executable:
        raise ValueError("Tesseract is not installed")
    try:
        result = subprocess.run([executable, "stdin", "stdout"], input=data, capture_output=True, timeout=30, check=True)
    except subprocess.TimeoutExpired as exc:
        raise ValueError("OCR timed out") from exc
    except subprocess.CalledProcessError as exc:
        raise ValueError("Tesseract could not read this image") from exc
    text = result.stdout.decode("utf-8", errors="replace").strip()
    if len(text) > 1_000_000:
        raise ValueError("OCR output exceeds the text limit")
    return text
