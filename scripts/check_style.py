import ast
import io
import re
import subprocess
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = {".py"}
C_LIKE = {".ts", ".tsx", ".js", ".mjs", ".dart", ".css"}
SKIP_PARTS = {"node_modules", ".venv", "dist", "build", "__pycache__", ".dart_tool", "migrations_old"}
SKIP_PREFIXES = (".claude/", ".github/", ".hallmark/", ".impeccable/")
REGEX_PRECEDERS = set("(,=:[!&|?{};")


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    for name in out.splitlines():
        path = ROOT / name
        if not path.is_file() or name.startswith(SKIP_PREFIXES) or SKIP_PARTS & set(path.parts):
            continue
        if path.suffix in PYTHON | C_LIKE:
            yield path


def docstring_statement(node):
    body = getattr(node, "body", None)
    if not isinstance(body, list) or not body:
        return None
    first = body[0]
    if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
        return first
    return None


def is_function(node):
    return isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)


def python_issues(source):
    issues = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT:
            issues.append((token.start[0], "comment"))
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            statement = docstring_statement(node)
            if statement:
                issues.append((statement.lineno, "docstring"))
        if is_function(node) and node.returns is not None:
            issues.append((node.returns.lineno, "return annotation"))
    return sorted(issues)


class Offsets:
    def __init__(self, source):
        self.lines = source.splitlines(keepends=True)
        self.starts = [0]
        for line in self.lines:
            self.starts.append(self.starts[-1] + len(line))

    def char(self, line, column):
        return self.starts[line - 1] + column

    def byte(self, line, column):
        return self.starts[line - 1] + len(self.lines[line - 1].encode()[:column].decode())


def apply_edits(source, edits):
    for start, end, replacement in sorted(set(edits), reverse=True):
        source = source[:start] + replacement + source[end:]
    return source


def without_comments(source):
    offsets = Offsets(source)
    edits = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue
        line, column = token.start
        if not offsets.lines[line - 1][:column].strip():
            edits.append((offsets.starts[line - 1], offsets.starts[line], ""))
            continue
        start = offsets.char(line, column)
        while source[start - 1] in " \t":
            start -= 1
        edits.append((start, offsets.char(*token.end), ""))
    return apply_edits(source, edits)


def without_docstrings(source):
    offsets = Offsets(source)
    edits = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        statement = docstring_statement(node)
        if statement and len(node.body) == 1:
            edits.append(
                (
                    offsets.byte(statement.lineno, statement.col_offset),
                    offsets.byte(statement.end_lineno, statement.end_col_offset),
                    "pass",
                )
            )
        elif statement:
            edits.append((offsets.starts[statement.lineno - 1], offsets.starts[statement.end_lineno], ""))
    return apply_edits(source, edits)


def without_returns(source):
    offsets = Offsets(source)
    tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    edits = []
    for node in ast.walk(ast.parse(source)):
        if not is_function(node) or node.returns is None:
            continue
        returns_start = offsets.byte(node.returns.lineno, node.returns.col_offset)
        returns_end = offsets.byte(node.returns.end_lineno, node.returns.end_col_offset)
        arrow = max(
            index for index, token in enumerate(tokens) if token.string == "->" and offsets.char(*token.start) < returns_start
        )
        previous = arrow - 1
        while tokens[previous].type in (tokenize.NL, tokenize.COMMENT):
            previous -= 1
        colon = next(token for token in tokens if token.string == ":" and offsets.char(*token.start) >= returns_end)
        edits.append((offsets.char(*tokens[previous].end), offsets.char(*colon.start), ""))
    return apply_edits(source, edits)


def python_fixed(source):
    source = without_returns(without_docstrings(without_comments(source)))
    source = re.sub(r"\n{4,}", "\n\n\n", source).lstrip("\n")
    return source if source.endswith("\n") else source + "\n"


def normalized_dump(source):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            if docstring_statement(node):
                node.body = node.body[1:] or [ast.Pass()]
        if is_function(node):
            node.returns = None
    return ast.dump(tree)


def c_like_issues(text, css):
    lines = []
    index = 0
    length = len(text)
    previous = ""
    while index < length:
        char = text[index]
        pair = text[index : index + 2]
        if char in "'\"":
            end = index + 1
            while end < length and text[end] not in (char, "\n"):
                end += 2 if text[end] == "\\" else 1
            if end < length and text[end] == char:
                index = end + 1
                previous = char
                continue
        elif char == "`":
            end = index + 1
            while end < length and text[end] != "`":
                end += 2 if text[end] == "\\" else 1
            index = end + 1
            previous = "`"
            continue
        elif pair == "/*" or (pair == "//" and not css):
            lines.append(text.count("\n", 0, index) + 1)
            if pair == "//":
                end = text.find("\n", index)
                index = length if end == -1 else end
            else:
                end = text.find("*/", index + 2)
                index = length if end == -1 else end + 2
            continue
        elif char == "/" and not css and (previous == "" or previous in REGEX_PRECEDERS):
            end = index + 1
            in_class = False
            while end < length and text[end] != "\n":
                if text[end] == "\\":
                    end += 2
                    continue
                if text[end] == "[":
                    in_class = True
                elif text[end] == "]":
                    in_class = False
                elif text[end] == "/" and not in_class:
                    break
                end += 1
            if end < length and text[end] == "/":
                index = end + 1
                previous = "/"
                continue
        if not char.isspace():
            previous = char
        index += 1
    return lines


def main(argv):
    fix = "--fix" in argv
    explicit = [Path(arg).resolve() for arg in argv if not arg.startswith("--")]
    files = explicit or list(tracked_files())
    failures = 0
    for path in files:
        source = path.read_text(encoding="utf-8")
        if path.suffix in PYTHON:
            issues = python_issues(source)
            if issues and fix:
                try:
                    fixed = python_fixed(source)
                    unchanged = normalized_dump(fixed) == normalized_dump(source)
                except SyntaxError:
                    unchanged = False
                if not unchanged:
                    print(f"refused, syntax tree changed: {path.relative_to(ROOT)}")
                    failures += 1
                    continue
                path.write_text(fixed, encoding="utf-8")
                issues = python_issues(fixed)
        else:
            issues = [(line, "comment") for line in c_like_issues(source, path.suffix == ".css")]
        for line, kind in issues:
            print(f"{path.relative_to(ROOT)}:{line}: {kind}")
        failures += len(issues)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
