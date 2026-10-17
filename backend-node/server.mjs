// Optional tiny API: serves news.json with CORS and refreshes it daily. node server.mjs
import http from "node:http"; import { readFile } from "node:fs/promises"; import { execFile } from "node:child_process";
const FILE = "../data/news.json", PORT = process.env.PORT || 8787;
const refresh = () => execFile("node", ["fetch-news.mjs"], (e, o, s) => console.log(e ? s : o));
refresh(); setInterval(refresh, 24 * 3600e3);
http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/news.json")) {
    try { res.setHeader("Content-Type","application/json"); res.setHeader("Cache-Control","max-age=900");
      return res.end(await readFile(FILE)); } catch { res.statusCode = 503; return res.end("{}"); }
  }
  res.statusCode = 404; res.end();
}).listen(PORT, () => console.log(`http://localhost:${PORT}/news.json`));
