/*
 * Field Lists — Worker entry point
 * ------------------------------------------------------------------
 * Two kinds of routes live here; everything that matches neither falls
 * through to the static assets in public/ (CSS, JS, images, favicon).
 *
 * HTML pages — generated on the fly from src/config.js via src/pages.js.
 * As of 2026-08-25 there are no per-trade .html files anymore; adding a
 * trade is one line in config.js and these routes pick it up immediately
 * (see config.js's comment and README §9):
 *
 *   GET  /                        -> internal directory (all jobs/trades)
 *   GET  /:jobSlug/review         -> that job's combined Review queue page
 *   GET  /:jobSlug/:tradeSlug     -> that trade's page (404s via ASSETS if
 *                                    jobSlug or tradeSlug isn't in config.js)
 *
 * JSON API routes — used by public/assets/js/render.js's client-side fetch
 * calls on the pages above:
 *
 *   GET  /api/tasks/:jobSlug/:tradeSlug   -> PROJECT_DATA JSON for that
 *                                            job+trade — open items plus
 *                                            ones pending review (see
 *                                            README §5 and §8)
 *   GET  /api/review/:jobSlug             -> PROJECT_DATA JSON for that
 *                                            job's whole Review queue,
 *                                            every trade combined (§8)
 *   POST /api/tasks/:taskId/progress      -> { progress: 0 | 0.75 | 1 }
 *                                            body; writes back to
 *                                            JobTread, returns the new
 *                                            state
 *
 * See README §9 for the full picture, and src/jobtread.js for what talks
 * to JobTread itself — this file is just routing and error shaping.
 */

import { JOBS } from "./config.js";
import { fetchTradeTasks, fetchReviewTasks, setTaskProgress, PENDING_REVIEW_PROGRESS } from "./jobtread.js";
import { renderTradePageHtml, renderReviewPageHtml, renderIndexPageHtml } from "./pages.js";

// The only three values a task's progress is ever set to by this site —
// see README §8 for the full state machine. Kept as a small allowlist
// (rather than accepting any 0–1 number) so a stray bug or bad request
// can't silently write a half-meaningless progress value to JobTread.
const ALLOWED_PROGRESS_VALUES = [0, PENDING_REVIEW_PROGRESS, 1];

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(html, status) {
  return new Response(html, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleGetTasks(env, jobSlug, tradeSlug) {
  const job = JOBS[jobSlug];
  if (!job) return jsonResponse({ error: `Unknown job "${jobSlug}"` }, 404);

  const taskTypeName = job.trades[tradeSlug];
  if (!taskTypeName) return jsonResponse({ error: `Unknown trade "${tradeSlug}" for job "${jobSlug}"` }, 404);

  try {
    const data = await fetchTradeTasks(env, {
      jobtreadJobId: job.jobtreadJobId,
      taskTypeName,
      displayName: job.displayName,
      rooms: job.rooms,
    });
    return jsonResponse(data);
  } catch (err) {
    // Never let a JobTread hiccup show a subcontractor a raw stack trace —
    // render.js shows a plain "couldn't load" message on any non-2xx here.
    console.error("fetchTradeTasks failed:", err);
    return jsonResponse({ error: "Couldn't load tasks from JobTread right now." }, 502);
  }
}

async function handleGetReview(env, jobSlug) {
  const job = JOBS[jobSlug];
  if (!job) return jsonResponse({ error: `Unknown job "${jobSlug}"` }, 404);

  try {
    const data = await fetchReviewTasks(env, {
      jobtreadJobId: job.jobtreadJobId,
      displayName: job.displayName,
      rooms: job.rooms,
    });
    return jsonResponse(data);
  } catch (err) {
    console.error("fetchReviewTasks failed:", err);
    return jsonResponse({ error: "Couldn't load the review list from JobTread right now." }, 502);
  }
}

async function handlePostProgress(request, env, taskId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Expected a JSON body like { progress: 0.75 }" }, 400);
  }
  if (typeof body.progress !== "number" || !ALLOWED_PROGRESS_VALUES.includes(body.progress)) {
    return jsonResponse({ error: `"progress" must be one of ${ALLOWED_PROGRESS_VALUES.join(", ")}` }, 400);
  }

  try {
    const result = await setTaskProgress(env, taskId, body.progress);
    return jsonResponse(result);
  } catch (err) {
    console.error("setTaskProgress failed:", err);
    return jsonResponse({ error: "Couldn't save that to JobTread right now." }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","tasks","main-st","framing"]

    if (request.method === "GET" && parts[0] === "api" && parts[1] === "tasks" && parts.length === 4) {
      return handleGetTasks(env, parts[2], parts[3]);
    }

    if (request.method === "GET" && parts[0] === "api" && parts[1] === "review" && parts.length === 3) {
      return handleGetReview(env, parts[2]);
    }

    if (
      request.method === "POST" &&
      parts[0] === "api" &&
      parts[1] === "tasks" &&
      parts.length === 4 &&
      parts[3] === "progress"
    ) {
      return handlePostProgress(request, env, parts[2]);
    }

    // Dynamic HTML pages — generated straight from config.js (see this
    // file's header comment and src/pages.js). These three routes are the
    // ENTIRE reason a trade only needs one line in config.js now: nothing
    // below writes a file, it all renders on the fly from JOBS.
    if (request.method === "GET" && parts.length === 0) {
      return htmlResponse(renderIndexPageHtml(JOBS));
    }

    if (request.method === "GET" && parts.length === 2 && parts[0] !== "api") {
      const job = JOBS[parts[0]];
      if (job) {
        if (parts[1] === "review") {
          return htmlResponse(renderReviewPageHtml(parts[0], job));
        }
        if (job.trades[parts[1]]) {
          return htmlResponse(renderTradePageHtml(parts[0], parts[1], job));
        }
      }
      // Unknown job or unknown trade for a known job — fall through to
      // ASSETS.fetch below, which serves Cloudflare's 404 page. Deliberately
      // NOT an error thrown here: a mistyped URL should just 404 like any
      // other missing page, not show a raw error.
    }

    // Everything else (CSS/JS/photos/favicon, and any URL that didn't match
    // a route above) is served from public/ exactly as before this file's
    // dynamic routes existed.
    return env.ASSETS.fetch(request);
  },
};
