// Node 18+ : PERPLEXITY_API_KEY=... node fetch-news.mjs
import { writeFile } from "node:fs/promises";
const KEY = process.env.PERPLEXITY_API_KEY;
if (!KEY) throw new Error("Set PERPLEXITY_API_KEY");
const OUT = process.env.OUT_FILE || "../data/news.json";
const CATEGORIES = {
  ai: "artificial intelligence (models, research, chips, policy, industry)",
  quantum: "quantum computing (hardware, error correction, algorithms, industry)",
};
const schema = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object",
    properties: { title:{type:"string"}, summary:{type:"string"}, url:{type:"string"},
      source:{type:"string"}, published:{type:"string"} },
    required: ["title","summary","url","source"] } } },
  required: ["items"],
};
async function fetchCategory(key, topic) {
  const res = await fetch("https://api.perplexity.ai/v1/agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      preset: "fast",
      input: `List the 6 most important news stories from the last 24 hours about ${topic}. Give a 1-2 sentence summary for each.`,
      instructions: "You are a news editor. Use the web_search tool for current news. Return only factual, sourced stories, and give the original article URL for each.",
      tools: [{
        type: "web_search",
        filters: {
          search_recency_filter: "day",
          // search_domain_filter: ["technologyreview.com", "nature.com"],  // optional allowlist, max 20
        },
      }],
      response_format: { type: "json_schema", json_schema: { name: "news_items", schema } },
    }),
  });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.output_text
    ?? (data.output || []).filter(o => o.type === "message")
        .flatMap(o => o.content || []).filter(c => c.type === "output_text")
        .map(c => c.text).join("\n");
  let items = [];
  try { items = JSON.parse(text).items; } catch { }
  const seen = new Set();
  const clean = items.filter(i => /^https?:\/\//.test(i.url) && !seen.has(i.url) && seen.add(i.url))
              .map(i => ({ ...i, category: key }));
  // Attach og:image per article in parallel (best effort, non-fatal).
  await Promise.all(clean.map(async i => {
    i.image = (await ogImage(i.url).catch(() => null)) || "";
  }));
  return clean;
}

// Fetch a page's og:image (OpenGraph) with timeout, UA, size cap, and relative-URL resolution.
const UA = "Mozilla/5.0 (compatible; frontier-news-widget/1.0)";
async function ogImage(url, { timeoutMs = 5000, maxBytes = 512_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!type.includes("html")) return null;
    const ct = res.headers.get("content-type") || "";
    // Read at most maxBytes of the body.
    const reader = res.body.getReader();
    const chunks = []; let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
    const html = Buffer.concat(chunks).toString("utf8");
    // Look for og:image, then twitter:image, then a first <img> inside <figure> or with a lead role.
    const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    const twMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
      || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i);
    const figMatch = html.match(/<figure[^>]*>[\s\S]{0,400}?<img[^>]*src=["']([^"']+)["']/i);
    const raw = (ogMatch && ogMatch[1]) || (twMatch && twMatch[1]) || (figMatch && figMatch[1]);
    if (!raw) return null;
    // Resolve relative URLs against the final response URL.
    return new URL(raw, res.url).toString();
  } catch { return null; }
  finally { clearTimeout(t); }
}

const out = { updated: new Date().toISOString(), categories: {} };
const failures = [];
for (const [k, t] of Object.entries(CATEGORIES)) {
  try { out.categories[k] = await fetchCategory(k, t); }
  catch (e) { console.error(e.message); failures.push(k); out.categories[k] = []; }
}
await writeFile(OUT, JSON.stringify(out, null, 2));
if (failures.length) { console.error(`Failed categories: ${failures.join(", ")}`); process.exit(1); }
console.log(`Wrote ${OUT}`);
