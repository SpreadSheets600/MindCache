import re
from collections import Counter


def matching_excerpt(content, terms, radius=90):
    if not content:
        return None
    patterns = sorted({term for term in terms if term}, key=len, reverse=True)
    if not patterns:
        return None
    matches = list(re.finditer("|".join(re.escape(term) for term in patterns), content, re.IGNORECASE))
    if not matches:
        return None
    counts = Counter()
    left = 0
    right = 0
    best = 0
    match = matches[0]
    for candidate in matches:
        while right < len(matches) and matches[right].start() < candidate.end() + radius:
            counts[matches[right].group().casefold()] += 1
            right += 1
        while left < right and matches[left].end() <= candidate.start() - radius:
            key = matches[left].group().casefold()
            counts[key] -= 1
            if not counts[key]:
                del counts[key]
            left += 1
        if len(counts) > best:
            best = len(counts)
            match = candidate
    start = max(0, match.start() - radius)
    end = min(len(content), match.end() + radius)
    excerpt = " ".join(content[start:end].split())
    return ("…" if start else "") + excerpt + ("…" if end < len(content) else "")
