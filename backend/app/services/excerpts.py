import re


def matching_excerpt(content: str, terms: list[str], radius: int = 90):
    if not content:
        return None
    matches = [match for term in terms if term for match in [re.search(re.escape(term), content, re.IGNORECASE)] if match]
    if not matches:
        return None
    match = min(matches, key=lambda item: item.start())
    start = max(0, match.start() - radius)
    end = min(len(content), match.end() + radius)
    excerpt = " ".join(content[start:end].split())
    return ("…" if start else "") + excerpt + ("…" if end < len(content) else "")
