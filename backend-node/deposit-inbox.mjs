// Node 20+ : FRONTIER_INBOX_KEY=... node deposit-inbox.mjs
// Deposits the day's automated research output in the Frontier Research Inbox,
// the upload-only drop box read by the site-building agent for
// insomniaatthefrontier.ai. One file per send:
//   data/news.json                -> "Frontier News · DATE · ..."
//   data/signals-candidates.json  -> "Weak-Signal Radar · DATE · ..."
//
// Rules (deliberate):
//  - The upload code is read from the environment only. It is never printed
//    and never written to disk. Without it the script exits 0 and says so.
//  - Only a snapshot collected within MAX_AGE_HOURS is sent, so a failed
//    collection that preserved yesterday's file is not deposited twice.
//    FORCE=1 sends regardless (backfill or test).
//  - DRY_RUN=1 prints what would be sent and sends nothing.
//  - Both files are unreviewed bot output and are titled as such. The reviewed
//    radar (data/signals.json) is curated separately and is not sent.
//  - A failed send is retried once, then the script exits non-zero.
import { readFile } from "node:fs/promises";

const ENDPOINT = "https://frontier-research-inbox.csailbt.chatgpt.site/send/perplexity";
const KEY = process.env.FRONTIER_INBOX_KEY || "";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const DRY = process.env.DRY_RUN === "1";
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS || 6);
const DATA = new URL("../data/", import.meta.url);

const hhmm = iso => iso.slice(11, 16);

async function load(name) {
  const text = await readFile(new URL(name, DATA), "utf8");
  return { text, json: JSON.parse(text) };
}

function describeNews({ json }) {
  const stamp = json.updated;
  const counts = Object.entries(json.categories || {}).map(([k, v]) => `${v.length} ${k}`);
  const total = Object.values(json.categories || {}).reduce((n, v) => n + v.length, 0);
  return {
    stamp,
    filename: `frontier-news-${stamp.slice(0, 10)}.json`,
    title: `Frontier News · ${stamp.slice(0, 10)} · daily AI and quantum feed JSON (${total} stories: ${counts.join(", ")}; collected ${hhmm(stamp)} UTC; unreviewed)`,
  };
}

function describeSignals({ json }) {
  const stamp = json.collected;
  const h = json.collection_health || {};
  return {
    stamp,
    filename: `weak-signal-candidates-${stamp.slice(0, 10)}.json`,
    title: `Weak-Signal Radar · ${stamp.slice(0, 10)} · candidate queue JSON (${(json.items || []).length} candidates; ${h.verticals_ok ?? "?"} of ${(h.verticals_ok ?? 0) + (h.verticals_failed ?? 0)} verticals ok; collected ${hhmm(stamp)} UTC; unreviewed)`,
  };
}

async function send(file, meta) {
  const form = new FormData();
  form.set("key", KEY);
  form.set("title", meta.title);
  form.set("model", `Perplexity Agent API via GitHub Actions (csailbt/frontier-news) · collected ${meta.stamp.slice(0, 10)}`.slice(0, 100));
  form.set("attachment", new Blob([file.text], { type: "application/json" }), meta.filename);
  const res = await fetch(ENDPOINT, { method: "POST", headers: { Accept: "application/json" }, body: form, signal: AbortSignal.timeout(90_000) });
  let body = {};
  try { body = await res.json(); } catch {}
  return { ok: res.ok && body.ok === true, http: res.status, receipt: body.receipt ?? null, message: body.message ?? null };
}

const jobs = [
  ["news.json", describeNews],
  ["signals-candidates.json", describeSignals],
];

if (!KEY && !DRY) {
  console.log("FRONTIER_INBOX_KEY is not set; inbox deposit skipped.");
  process.exit(0);
}

let failed = false;
for (const [name, describe] of jobs) {
  let file, meta;
  try {
    file = await load(name);
    meta = describe(file);
    if (!meta.stamp || Number.isNaN(Date.parse(meta.stamp))) throw new Error("no collection timestamp");
  } catch (e) {
    console.log(`${name}: skipped (${String(e.message || e).slice(0, 120)})`);
    continue;
  }
  if (meta.title.length > 140) meta.title = meta.title.slice(0, 139) + "…";
  const ageHours = (Date.now() - Date.parse(meta.stamp)) / 36e5;
  if (!FORCE && ageHours > MAX_AGE_HOURS) {
    console.log(`${name}: skipped, snapshot is ${ageHours.toFixed(1)} h old (limit ${MAX_AGE_HOURS} h); nothing new to deposit.`);
    continue;
  }
  if (DRY) { console.log(`${name}: would send "${meta.title}" as ${meta.filename} (${file.text.length} bytes)`); continue; }
  let r;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { r = await send(file, meta); } catch (e) { r = { ok: false, http: 0, receipt: null, message: String(e.message || e).slice(0, 200) }; }
    if (r.ok) break;
    if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  console.log(`${name}: ${r.ok ? "deposited" : "FAILED"} · http ${r.http} · receipt ${r.receipt ?? "none"} · "${meta.title}"${r.ok ? "" : ` · ${r.message ?? ""}`}`);
  failed ||= !r.ok;
}
process.exit(failed ? 1 : 0);
