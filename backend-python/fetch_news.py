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
    r = requests.post("https://api.perplexity.ai/chat/completions", timeout=90,
        headers={"Authorization": f"Bearer {KEY}"},
        json={"model": "sonar",
              "messages": [
                  {"role": "system", "content": "You are a news editor. Return only factual, sourced news. Each url must be the original article URL."},
                  {"role": "user", "content": f"List the 6 most important news stories from the last 24 hours about {topic}. Summary: 1-2 sentences."}],
              "search_recency_filter": "day",
              # "search_domain_filter": ["technologyreview.com", "nature.com"],
              "web_search_options": {"search_context_size": "medium"},
              "response_format": {"type": "json_schema", "json_schema": {"schema": SCHEMA}}})
    r.raise_for_status()
    try: items = json.loads(r.json()["choices"][0]["message"]["content"])["items"]
    except Exception: items = []
    seen, out = set(), []
    for i in items:
        if re.match(r"^https?://", i.get("url", "")) and i["url"] not in seen:
            seen.add(i["url"]); out.append({**i, "category": key})
    return out

data = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(), "categories": {}}
for k, t in CATEGORIES.items():
    try: data["categories"][k] = fetch_category(k, t)
    except Exception as e: print(k, e); data["categories"][k] = []
with open(OUT, "w") as f: json.dump(data, f, indent=2)
print("Wrote", OUT)
