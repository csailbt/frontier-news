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
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You are a news editor. Return only factual, sourced news. Each url must be the original article URL." },
        { role: "user", content: `List the 6 most important news stories from the last 24 hours about ${topic}. Summary: 1-2 sentences.` },
      ],
      search_recency_filter: "day",
      // search_domain_filter: ["arstechnica.com","technologyreview.com","nature.com"], // optional allowlist (max 20; prefix "-" to exclude)
      web_search_options: { search_context_size: "medium" },
      response_format: { type: "json_schema", json_schema: { schema } },
    }),
  });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  let items = [];
  try { items = JSON.parse(data.choices[0].message.content).items; } catch { }
  const seen = new Set();
  return items.filter(i => /^https?:\/\//.test(i.url) && !seen.has(i.url) && seen.add(i.url))
              .map(i => ({ ...i, category: key }));
}
const out = { updated: new Date().toISOString(), categories: {} };
const failures = [];
for (const [k, t] of Object.entries(CATEGORIES)) {
  try { out.categories[k] = await fetchCategory(k, t); }
  catch (e) { console.error(e.message); failures.push(k); out.categories[k] = []; }
}
if (failures.length) { console.error(`Failed categories: ${failures.join(", ")}`); process.exit(1); }
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);
