from ddgs import DDGS

with DDGS() as ddgs:
    results = list(ddgs.text("Trafilatura", max_results=10))

for r in results:
    print(r["title"])
    print(r["href"])
    print()
