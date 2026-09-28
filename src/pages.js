/*
 * Field Lists — dynamic page generation
 * ------------------------------------------------------------------
 * Trade pages, the Review page, and the internal directory used to be
 * separate static .html files in public/ — one per trade, hand-written,
 * plus a manual link added to index.html every time. That was a real,
 * repeated source of confusion (see src/config.js's big comment and
 * README §9): a trade added to config.js with no matching static file
 * just 404'd, silently, and it was easy to forget the index.html link.
 *
 * As of 2026-08-25, none of that exists anymore. These three functions
 * generate the exact same HTML shape the old static files had, straight
 * from src/config.js's JOBS data, on every request. Adding a trade is
 * now genuinely one line in config.js — src/worker.js's routing (see
 * that file) picks it up immediately, nothing else to create or edit.
 *
 * Each function returns a complete HTML document as a string — see
 * src/worker.js for how these get turned into a Response.
 */

import { labelFromSlug } from "./config.js";

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shared page shell — every page here is the same skeleton (header slot +
// task-list slot, wired up by public/assets/js/render.js) with a
// different <title> and a different window.FIELD_LISTS_LIVE payload
// telling render.js what to fetch and how to render it.
function shell({ title, footer, bodyClass, liveConfigJson, mainHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ""}>
${mainHtml}
  <footer class="page-footer">${escapeHtml(footer)}</footer>
${
  liveConfigJson
    ? `
  <script>window.FIELD_LISTS_LIVE = ${liveConfigJson};</script>
  <script src="/assets/js/render.js"></script>`
    : ""
}
</body>
</html>
`;
}

const TASK_LIST_MAIN = `  <header class="page-header" data-field-header></header>
  <main class="wrap">
    <div class="task-list" data-task-list></div>
  </main>`;

// One subcontractor-facing trade page — generated from config.js, no
// per-trade HTML file needed.
export function renderTradePageHtml(jobSlug, tradeSlug, job) {
  const label = labelFromSlug(tradeSlug);
  return shell({
    title: `${label} — ${job.displayName}`,
    footer: "Field Lists — for job site use",
    liveConfigJson: JSON.stringify({ job: jobSlug, trade: tradeSlug }),
    mainHtml: TASK_LIST_MAIN,
  });
}

// The combined office/PM review queue for one job — generated the same
// way, no per-job review.html file needed.
export function renderReviewPageHtml(jobSlug, job) {
  return shell({
    title: `Needs Review — ${job.displayName}`,
    footer: "Field Lists — for internal use",
    liveConfigJson: JSON.stringify({ job: jobSlug, review: true }),
    mainHtml: TASK_LIST_MAIN,
  });
}

// The internal directory listing every job's trade pages — was
// public/index.html. Trades are listed alphabetically by their
// on-screen label (the same order the old hand-written file used), not
// by slug, so e.g. "excavation" still sorts before "exterior".
export function renderIndexPageHtml(jobs) {
  const jobBlocks = Object.entries(jobs)
    .map(([jobSlug, job]) => {
      const tradeLinks = Object.keys(job.trades)
        .map((slug) => ({ slug, label: labelFromSlug(slug) }))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((t) => `        <a href="/${jobSlug}/${t.slug}">${escapeHtml(t.label)}</a>`)
        .join("\n");

      return `    <div class="index-job">
      <p class="index-job__name">${escapeHtml(job.displayName)}</p>
      <div class="index-links">
${tradeLinks}
      </div>
      <div class="index-links" style="margin-top: 10px;">
        <a href="/${jobSlug}/review">Needs Review (office/PM)</a>
      </div>
    </div>`;
    })
    .join("\n");

  const mainHtml = `  <main class="wrap">
    <p class="index-title">Field Lists</p>
    <p class="index-sub">Internal directory — subcontractors are given a direct link to their own trade page and don't need this page.</p>

${jobBlocks}
  </main>`;

  return shell({
    title: "Field Lists",
    footer: "Field Lists — for internal use",
    bodyClass: "index-page",
    liveConfigJson: null,
    mainHtml,
  });
}
