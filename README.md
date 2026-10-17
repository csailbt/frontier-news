# Frontier News Widget: AI & Quantum Computing
Starter kit for insomniaatthefrontier.ai.

## Layout
- `backend-node/fetch-news.mjs`: calls the Perplexity Sonar API (`search_recency_filter: "day"`, optional `search_domain_filter`, JSON-schema output) and writes `data/news.json`
- `backend-node/server.mjs`: optional CORS JSON server that refreshes every 24h
- `backend-python/fetch_news.py`: same fetcher in Python
- `widget/news-widget.js`: embeddable widget with tabs (All/AI/Quantum), auto-refresh, responsive layout, dark theme, and HTML escaping
- `widget/demo.html`: local demo
- `.github-workflow-daily.yml`: free daily cron through GitHub Actions + Pages

## Quick start
    export PERPLEXITY_API_KEY=pplx-...
    cd backend-node && node fetch-news.mjs      # or: cd backend-python && python fetch_news.py
    cd .. && npx serve .                        # open /widget/demo.html

## Hosting (ChatGPT-built sites cannot run backend code)
Keep the API key off your site. Recommended setup:
1. Push this kit to a public GitHub repo. Add the `PERPLEXITY_API_KEY` secret, enable Pages, and move the workflow into `.github/workflows/`.
2. Your JSON is now at `https://<user>.github.io/<repo>/data/news.json` and the script at `.../widget/news-widget.js`. Both refresh daily.
3. In your site builder, add a custom HTML / embed block:

    <div id="frontier-news" data-src="https://<user>.github.io/<repo>/data/news.json" data-refresh="15"></div>
    <script src="https://<user>.github.io/<repo>/widget/news-widget.js" defer></script>

If the builder blocks scripts, host `demo.html` on Pages (point `data-src` at the JSON) and embed it with an `<iframe>`.
Alternatives: run `server.mjs` on Render, Fly, or AWS Lambda, or schedule a Lambda that writes to S3 behind CloudFront.

## Customize
- Add categories to `CATEGORIES` in either script; tabs are created automatically.
- Theme: edit the CSS variables `--bg --fg --acc --card` in the widget.
- Cost: 2 Sonar calls per day.
