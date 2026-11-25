import os

from app.services.scanner import MAX_BYTES, inside, scan


def write(path, content="hello world"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def names(root, extra=()):
    return sorted(os.path.relpath(item["path"], root) for item in scan(root, extra))


def test_supported_files_are_found_recursively(tmp_path):
    write(tmp_path / "a.txt")
    write(tmp_path / "deep" / "er" / "b.md")
    write(tmp_path / "code.py", "print(1)")
    assert names(tmp_path) == ["a.txt", "code.py", os.path.join("deep", "er", "b.md")]


def test_generated_and_secret_files_are_never_listed(tmp_path):
    write(tmp_path / "node_modules" / "pkg" / "index.js")
    write(tmp_path / ".git" / "config")
    write(tmp_path / ".env", "KEY=1")
    write(tmp_path / ".env.local", "KEY=2")
    write(tmp_path / "server.pem")
    write(tmp_path / "data.sqlite")
    write(tmp_path / "keep.txt")
    assert names(tmp_path) == ["keep.txt"]


def test_unsupported_empty_and_oversized_files_are_skipped(tmp_path):
    (tmp_path / "image.png").write_bytes(b"\x89PNG")
    write(tmp_path / "empty.txt", "")
    big = tmp_path / "big.txt"
    with open(big, "wb") as stream:
        stream.truncate(MAX_BYTES + 1)
    write(tmp_path / "ok.txt")
    assert names(tmp_path) == ["ok.txt"]


def test_symlinks_are_not_followed(tmp_path):
    outside = tmp_path / "outside"
    root = tmp_path / "root"
    write(outside / "secret.txt")
    root.mkdir()
    os.symlink(outside, root / "link")
    os.symlink(outside / "secret.txt", root / "file-link.txt")
    write(root / "real.txt")
    assert names(root) == ["real.txt"]


def test_custom_exclusions_apply(tmp_path):
    write(tmp_path / "drafts" / "x.txt")
    write(tmp_path / "keep.txt")
    write(tmp_path / "scratch.txt")
    assert names(tmp_path, ["scratch*", "drafts"]) == ["keep.txt"]


def test_inside_rejects_escapes(tmp_path):
    (tmp_path / "root").mkdir()
    assert inside(tmp_path / "root" / "a.txt", tmp_path / "root")
    assert not inside(tmp_path / "root" / ".." / "x.txt", tmp_path / "root")
