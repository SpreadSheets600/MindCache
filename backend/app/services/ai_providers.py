import json
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.core.ai_config import TaskModel


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _post(model: TaskModel, path: str, payload: dict, timeout: int = 120):
    model.validate()
    headers = {"Content-Type": "application/json"}
    if model.api_key:
        headers["Authorization"] = f"Bearer {model.api_key}"
    request = Request(model.endpoint.rstrip("/") + path, json.dumps(payload).encode(), headers, method="POST")
    try:
        with build_opener(NoRedirect()).open(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"AI provider returned HTTP {exc.code}") from exc


def generate(model: TaskModel, prompt: str):
    model.validate()
    if model.provider == "disabled":
        raise ValueError("Generation is disabled")
    if model.provider == "transformers":
        from transformers import pipeline
        generator = pipeline("text-generation", model=model.model, model_kwargs={"local_files_only": True})
        return generator(prompt, max_new_tokens=256, return_full_text=False)[0]["generated_text"]
    if model.provider == "ollama":
        return _post(model, "/api/generate", {"model": model.model, "prompt": prompt, "stream": False})["response"]
    return _post(model, "/chat/completions", {"model": model.model, "messages": [{"role": "user", "content": prompt}]})["choices"][0]["message"]["content"]


def download_model(model: TaskModel):
    model.validate()
    if model.provider == "transformers":
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=model.model)
    elif model.provider == "ollama":
        _post(model, "/api/pull", {"model": model.model, "stream": False}, timeout=3600)
    else:
        raise ValueError("This provider does not support model downloads in MindCache")
