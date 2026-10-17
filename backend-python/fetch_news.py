"""pip install requests ; PERPLEXITY_API_KEY=... python fetch_news.py"""
import json, os, re, datetime, requests
KEY = os.environ["PERPLEXITY_API_KEY"]
OUT = os.environ.get("OUT_FILE", "../data/news.json")
CATEGORIES = {
    "ai": "artificial intelligence (models, research, chips, policy, industry)",
    "quantum": "quantum computing (hardware, error correction, algorithms, industry)",
}
SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object",
    "properties": {k: {"type": "string"} for k in ["title", "summary", "url", "source", "published"]},
    "required": ["title", "summary", "url", "source"]}}}, "required": ["items"]}

def fetch_category(key, topic):
    r = requests.post("https://api.perplexity.ai/v1/agent", timeout=120,
        headers={"Authorization": f"Bearer {KEY}"},
        json={"preset": "fast",
              "input": f"List the 6 most important news stories from the last 24 hours about {topic}. Give a 1-2 sentence summary for each.",
              "instructions": "You are a news editor. Use the web_search tool for current news. Return only factual, sourced stories, and give the original article URL for each.",
              "tools": [{"type": "web_search", "filters": {
                  "search_recency_filter": "day",
                  # "search_domain_filter": ["technologyreview.com", "nature.com"],
              }}],
              "response_format": {"type": "json_schema", "json_schema": {"name": "news_items", "schema": SCHEMA}}})
    r.raise_for_status()
    d = r.json()
    text = d.get("output_text") or "\n".join(
        c["text"] for o in d.get("output", []) if o.get("type") == "message"
        for c in o.get("content", []) if c.get("type") == "output_text")
    try: items = json.loads(text)["items"]
    except Exception: items = []
    seen, out = set(), []
    for i in items:
        if re.match(r"^https?://", i.get("url", "")) and i["url"] not in seen:
            seen.add(i["url"]); out.append({**i, "category": key})
    return out

data = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(), "categories": {}}
failures = []
for k, t in CATEGORIES.items():
    try: data["categories"][k] = fetch_category(k, t)
    except Exception as e: print(k, e); failures.append(k); data["categories"][k] = []
with open(OUT, "w") as f: json.dump(data, f, indent=2)
print("Wrote", OUT)
if failures: raise SystemExit(f"Failed categories: {', '.join(failures)}")
