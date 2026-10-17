/* Embed: <div id="frontier-news" data-src="https://YOUR-HOST/news.json" data-refresh="15"></div>
          <script src="news-widget.js" defer></script> */
(() => {
  const css = `.fnw{--bg:#0d1117;--fg:#e6edf3;--mut:#8b949e;--acc:#7c5cff;--card:#161b22;font:15px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg);border-radius:14px;padding:16px;max-width:720px}
.fnw h3{margin:0 0 10px;font-size:18px}.fnw .tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.fnw button{background:var(--card);color:var(--fg);border:1px solid #30363d;border-radius:999px;padding:6px 14px;cursor:pointer;font:inherit}
.fnw button[aria-selected=true]{background:var(--acc);border-color:var(--acc)}
.fnw ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}.fnw li{background:var(--card);border-radius:10px;padding:12px}
.fnw a{color:var(--fg);font-weight:600;text-decoration:none}.fnw a:hover{color:var(--acc)}
.fnw p{margin:4px 0 0;color:var(--mut);font-size:14px}.fnw small,.fnw .ft{color:var(--mut);font-size:12px}.fnw .ft{margin-top:10px}
@media(min-width:640px){.fnw ul{grid-template-columns:1fr 1fr}}`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const LABEL = { all: "All", ai: "AI", quantum: "Quantum" };
  function mount(el) {
    const src = el.dataset.src || "news.json", mins = +el.dataset.refresh || 15;
    if (!document.getElementById("fnw-css")) { const s = document.createElement("style"); s.id = "fnw-css"; s.textContent = css; document.head.append(s); }
    el.className = "fnw"; let data = null, tab = "all";
    const render = () => {
      if (!data) { el.innerHTML = "<p>Loading news…</p>"; return; }
      const cats = data.categories || {};
      const items = tab === "all" ? Object.values(cats).flat() : cats[tab] || [];
      el.innerHTML = `<h3>${esc(el.dataset.title || "Frontier News: AI & Quantum")}</h3>
        <div class="tabs" role="tablist">${["all", ...Object.keys(cats)].map(k =>
          `<button role="tab" data-k="${k}" aria-selected="${k === tab}">${LABEL[k] || esc(k)}</button>`).join("")}</div>
        <ul>${items.map(i => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>
          <p>${esc(i.summary)}</p><small>${esc(i.source)}${i.published ? " · " + esc(i.published) : ""}</small></li>`).join("") || "<li>No stories yet.</li>"}</ul>
        <div class="ft">Updated ${new Date(data.updated).toLocaleString()}</div>`;
      el.querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.k; render(); });
    };
    const load = async () => {
      try { const r = await fetch(src + (src.includes("?") ? "&" : "?") + "t=" + Date.now()); data = await r.json(); }
      catch (e) { if (!data) el.innerHTML = "<p>News unavailable.</p>"; return; }
      render();
    };
    render(); load(); setInterval(load, mins * 60e3);
  }
  const init = () => document.querySelectorAll("#frontier-news,[data-frontier-news]").forEach(mount);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
