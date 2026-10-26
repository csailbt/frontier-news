// Node 18+ : PERPLEXITY_API_KEY=... node fetch-signals.mjs
// Companion to fetch-news.mjs. Collects CANDIDATE weak-signal entries — an
// unreviewed queue for editorial triage, NOT reviewed findings. The reviewed
// radar (data/signals.json) is curated separately; this script writes
// data/signals-candidates.json by default. Keep that separation.
//
// Failure semantics (deliberate):
//  - A vertical whose API call or parse FAILS is recorded as a failure, never
//    silently converted into "no candidates".
//  - If every vertical fails, the previous last-good output is preserved
//    untouched and the script exits non-zero (so a workflow can notice).
//  - A successful run with zero results is a legitimate outcome and is written.
import { writeFile, readFile, access } from "node:fs/promises";

const KEY = process.env.PERPLEXITY_API_KEY;
if (!KEY) throw new Error("Set PERPLEXITY_API_KEY");
const OUT = process.env.OUT_FILE || "../data/signals-candidates.json";

const VERTICALS = [
  "materials and specialty chemicals (incl. battery/semiconductor supply chain)",
  "pharmaceuticals and biotech",
  "banking, insurance and capital markets",
  "cybersecurity and defense",
  "industrials, energy and telecom infrastructure",
];

// Compact candidate schema: enough to triage, not enough to publish.
const schema = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object",
    properties: {
      company: { type: "string" },
      vertical: { type: "string" },
      technology_class: { type: "string", enum: ["ai", "quantum", "quantum-inspired", "quantum-hybrid", "other"] },
      signal: { type: "string" },          // what happened, in one factual sentence
      quantitative_outcome: { type: "string" }, // the measured claim, exact wording; "none stated" if absent
      comparator: { type: "string" },      // measured against what
      ladder_tier_guess: { type: "string", enum: ["activity", "capability", "operating-benefit", "competitive-advantage"] },
      provenance: { type: "string", enum: ["vendor-reported", "company-case-study", "press-reported", "independent-evaluation", "peer-reviewed", "regulator-or-registry"] },
      url: { type: "string" },
      source: { type: "string" },
      published: { type: "string" },       // YYYY-MM-DD, or empty string if the source does not state one
    },
    required: ["company", "vertical", "signal", "quantitative_outcome", "ladder_tier_guess", "provenance", "url", "source"] } } },
  required: ["items"],
};

async function fetchVertical(topic) {
  const res = await fetch("https://api.perplexity.ai/v1/agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      preset: "fast",
      input: `Find up to 4 events from the last 30 days where a company in ${topic} shows a WEAK SIGNAL of competitive advantage from AI or quantum tools: a measured operating-benefit (workflow, throughput, accuracy, cost, or discovery yield) that competitors would find hard to copy, OR a distinctive data-access move (proprietary dataset, unusual partnership, quiet filing) that could become one. Skip vendor hype with no numbers, skip pure funding announcements, skip anything you cannot source. For each: the measured outcome with exact wording (or 'none stated'), what it was measured against, and who reported it.`,
      instructions: "You are a research analyst collecting candidates for review, not publishing findings. Use the web_search tool. Only include stories with an original article URL. Never infer numbers that the source does not state. Prefer primary sources (company releases, filings, registry entries, independent evaluations) over aggregators. If the source does not state a publication date, leave published as an empty string.",
      tools: [{
        type: "web_search",
        filters: {
          search_recency_filter: "month",
        },
      }],
      response_format: { type: "json_schema", json_schema: { name: "signal_candidates", schema } },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.output_text
    ?? (data.output || []).filter(o => o.type === "message")
      .flatMap(o => o.content || []).filter(c => c.type === "output_text")
      .map(c => c.text).join("\n");
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error(`unparseable response: ${String(e).slice(0, 120)}`); }
  if (!parsed || !Array.isArray(parsed.items)) throw new Error("response missing items[]");
  const seen = new Set();
  const items = parsed.items.filter(i => /^https?:\/\//.test(i.url) && !seen.has(i.url) && seen.add(i.url));
  if (parsed.items.length > 0 && items.length === 0) throw new Error("all returned items failed URL validation");
  return { items, raw: parsed.items.length };
}

const results = await Promise.allSettled(VERTICALS.map(fetchVertical));
const failures = results.filter(r => r.status === "rejected").map(r => String(r.reason).slice(0, 200));
const ok = results.filter(r => r.status === "fulfilled").map(r => r.value.items).flat();

if (failures.length === VERTICALS.length) {
  // Total failure: preserve the last-good output rather than overwriting it.
  let preserved = false;
  try { await access(OUT); preserved = true; } catch {}
  console.error(`All ${VERTICALS.length} verticals failed; last-good ${OUT} ${preserved ? "preserved" : "absent (none written)"}.`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}

await writeFile(OUT, JSON.stringify({
  queue: "weak-signals-candidates",
  review_status: "unreviewed",
  collected: new Date().toISOString(),
  note: "Automated candidate collection. Not reviewed under this publication's evidence standard. Promote entries to the reviewed radar only through the website's curation process.",
  collection_health: {
    verticals_ok: VERTICALS.length - failures.length,
    verticals_failed: failures.length,
    failures: failures.length ? failures : undefined,
  },
  items: ok,
}, null, 2));

console.log(`Wrote ${ok.length} candidates to ${OUT} (${failures.length} vertical failure(s) recorded in collection_health).`);