/*
 * Field Lists — JobTread Pave API client
 * ------------------------------------------------------------------
 * Talks to JobTread's "Pave" JSON-graph API and maps the result into the
 * exact PROJECT_DATA shape render.js already knows how to draw (see
 * README.md §5). This is the only file that should know what a JobTread
 * "task" object looks like — everything downstream just sees plain
 * { project, tasks } data, same as the old static data/*.js files.
 *
 * Confirmed live end-to-end on 2026-08-23 against a real deployed Worker:
 * the raw fetch() to https://api.jobtread.com/pave, auth at
 * `query.$.grantKey`, works exactly as documented. (Getting here also
 * required one Cloudflare-specific fix, unrelated to this file: static
 * asset routing swallows `/api/*` requests before the Worker ever runs
 * unless `assets.run_worker_first` is set in wrangler.jsonc — see that
 * file and README §9.)
 */

const JOBTREAD_API_URL = "https://api.jobtread.com/pave";

async function queryJobTread(env, query) {
  const res = await fetch(JOBTREAD_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        $: { grantKey: env.JOBTREAD_GRANT_KEY },
        ...query,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`JobTread API returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = await res.json();
  if (body.errors) {
    throw new Error(`JobTread API error: ${JSON.stringify(body.errors).slice(0, 500)}`);
  }
  return body;
}

// Collapse spaces around a slash ("Study / Guest Bedroom" -> "study/guest
// bedroom") and normalize whitespace, so a room name written with or
// without spaces around a "/" still matches. Confirmed necessary against
// real task text on 2026-08-23 — "Study / Guest Bedroom" in a real
// description did not match "Study/Guest Bedroom" in the room list until
// this normalization was added.
function normalize(s) {
  return s.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

/**
 * Loosely match a room name from `rooms` inside `text`. Case-insensitive
 * substring match, tolerant of spacing differences around "/" (see
 * normalize() above). Longer/more specific room names are checked first
 * so e.g. "Living Room" wins over the shorter "Living" when both are
 * present in the room list and the text says "Living Room".
 *
 * Returns the room name exactly as it appears in `rooms` (not as typed in
 * the source text), or null if nothing in the list matches.
 *
 * Known real gap, confirmed against actual JobTread task text and not
 * fixed here on purpose (see README §9): wording variants that aren't
 * just spacing, e.g. a task description saying "Bathroom 3" does NOT
 * match a room list entry of "Bath 3" — this is a genuine wording
 * mismatch, not a bug, and guessing at synonyms risks false matches.
 */
export function parseLocation(text, rooms) {
  if (!text) return null;
  const haystack = normalize(text);
  const sorted = [...rooms].sort((a, b) => b.length - a.length);
  for (const room of sorted) {
    if (haystack.includes(normalize(room))) return room;
  }
  return null;
}

/**
 * Map one JobTread file's mime type to the { type, label, url } shape
 * render.js's attachment rendering expects (see README §5). Falls back to
 * a generic "file" type rather than dropping an attachment whose mime type
 * isn't image or pdf — same "never silently drop it" rule render.js
 * already follows for unrecognized attachment types.
 */
function mapFile(file) {
  const isImage = (file.type || "").startsWith("image/");
  const isPdf = file.type === "application/pdf";
  return {
    type: isImage ? "image" : isPdf ? "pdf" : "file",
    label: file.name || (isImage ? "Photo" : isPdf ? "Document" : "File"),
    // Resize images down for the card/lightbox instead of shipping full
    // camera-resolution originals — JobTread's file URLs support this via
    // a `size` argument. PDFs/other files use the plain download URL.
    url: isImage ? `${file.url}${file.url.includes("?") ? "&" : "?"}size=1600` : file.url,
  };
}

// Progress is a three-state field now, not a plain boolean (see README §8):
//   0 (or null, JobTread's default for an untouched task) — open
//   0.75  — a subcontractor marked it done in the field; NOT complete in
//           JobTread yet, sitting in the office/PM Review list
//   1     — confirmed complete by the office/PM on the Review page; this is
//           the only path that ever sets JobTread's own `completed` field
export const PENDING_REVIEW_PROGRESS = 0.75;

function mapTask(task, filesByTaskId, rooms) {
  const text = `${task.name || ""} ${task.description || ""}`;
  return {
    jobTreadTaskId: task.id,
    name: task.name,
    description: task.description || "",
    location: parseLocation(text, rooms),
    attachments: (filesByTaskId.get(task.id) || []).map(mapFile),
    completed: !!task.completed,
    pendingReview: task.progress === PENDING_REVIEW_PROGRESS,
    trade: task.taskType && task.taskType.name ? task.taskType.name : null,
  };
}

// Shared "fetch tasks, then fetch their files as a second flat query"
// pipeline used by both fetchTradeTasks() and fetchReviewTasks() below.
//
// This is deliberately TWO queries, not one nested query. Asking for each
// task's `files` inline (task -> files -> nodes) reliably failed while
// building this — the response was rejected as too large even for a
// fairly small, ordinary trade like Plumbing (17 tasks, nothing unusual
// in it). Fetching the task list first and then the files for just those
// task IDs as a separate, flat query (confirmed working live on
// 2026-08-23) avoids whatever triggered that and is not meaningfully
// slower — it's still exactly two round trips either way.
async function fetchTasksWithFiles(env, jobtreadJobId, where) {
  const taskResult = await queryJobTread(env, {
    job: {
      $: { id: jobtreadJobId },
      tasks: {
        $: {
          where,
          // 100 is the API's own max page size — confirmed live
          // 2026-08-23 (a request for 200 was rejected). Fine for a
          // single trade (or a single job's whole review queue) today; if
          // any list ever needs more than 100 items at once, this needs
          // real pagination (follow nextPage) rather than a bigger number.
          size: 100,
        },
        nodes: { id: {}, name: {}, description: {}, completed: {}, progress: {}, taskType: { name: {} } },
      },
    },
  });

  const tasks = taskResult.job?.tasks?.nodes || [];
  const filesByTaskId = new Map();

  if (tasks.length) {
    const fileResult = await queryJobTread(env, {
      job: {
        $: { id: jobtreadJobId },
        files: {
          $: {
            where: {
              in: [{ field: ["task", "id"] }, tasks.map((t) => ({ value: t.id }))],
            },
            size: 100,
          },
          nodes: { id: {}, name: {}, type: {}, url: {}, task: { id: {} } },
        },
      },
    });
    for (const file of fileResult.job?.files?.nodes || []) {
      const taskId = file.task?.id;
      if (!taskId) continue;
      if (!filesByTaskId.has(taskId)) filesByTaskId.set(taskId, []);
      filesByTaskId.get(taskId).push(file);
    }
  }

  return { tasks, filesByTaskId };
}

/**
 * Fetch every to-do on `jobtreadJobId` whose taskType matches
 * `taskTypeName` that isn't yet office-confirmed complete (progress: 1) —
 * both plain open items AND ones a subcontractor already marked done in
 * the field (progress: 0.75, awaiting review — see PENDING_REVIEW_PROGRESS
 * above and README §8). Returned already shaped as PROJECT_DATA (see
 * README §5), ready to hand straight to render.js.
 *
 * Filtering out progress-1 tasks specifically as `completed != 1` rather
 * than `progress < 1`: confirmed live on 2026-08-23 that JobTread's
 * `progress` is `null` (not 0) on an untouched task, and comparison
 * operators treat null as "doesn't match" rather than "less than
 * anything" — `progress < 1` silently excluded every untouched task.
 * `completed` is reliably 0 on every task that isn't fully done, so
 * filtering on that instead avoids the null gotcha entirely.
 */
export async function fetchTradeTasks(env, { jobtreadJobId, taskTypeName, displayName, rooms }) {
  const { tasks, filesByTaskId } = await fetchTasksWithFiles(env, jobtreadJobId, {
    and: [
      { "=": [{ field: "isToDo" }, { value: true }] },
      // Verified live on 2026-08-23 — the plain shorthand
      // [field, op, value] only works for direct scalar fields on task;
      // filtering by a relation's sub-field (taskType.name) needs the
      // full expression form below.
      { "=": [{ field: ["taskType", "name"] }, { value: taskTypeName }] },
      { "!=": [{ field: "completed" }, { value: 1 }] },
    ],
  });

  return {
    project: {
      name: displayName,
      trade: taskTypeName,
      updatedAt: new Date().toISOString(),
    },
    tasks: tasks.map((t) => mapTask(t, filesByTaskId, rooms)),
  };
}

/**
 * Fetch every task on `jobtreadJobId` that's marked done in the field but
 * not yet office-confirmed (progress: 0.75) — across every trade, not just
 * one. This is the office/PM Review queue (see README §8): a combined,
 * per-job list rather than per-trade, since the point is walking the whole
 * project once and clearing everything a sub flagged, regardless of trade.
 * `task.trade` (added by mapTask from the queried taskType.name) is what
 * the Review page's UI uses to badge each card by trade.
 */
export async function fetchReviewTasks(env, { jobtreadJobId, displayName, rooms }) {
  const { tasks, filesByTaskId } = await fetchTasksWithFiles(env, jobtreadJobId, {
    and: [
      { "=": [{ field: "isToDo" }, { value: true }] },
      { "=": [{ field: "progress" }, { value: PENDING_REVIEW_PROGRESS }] },
    ],
  });

  return {
    project: {
      name: displayName,
      trade: "Needs Review",
      updatedAt: new Date().toISOString(),
    },
    tasks: tasks.map((t) => mapTask(t, filesByTaskId, rooms)),
  };
}

/**
 * Write a task's progress back to JobTread — the one function that ever
 * changes it, called from three places with three exact values (see
 * README §8 for the full state machine):
 *   0    — trade page: subcontractor un-marks a task (back to open)
 *   0.75 — trade page: subcontractor marks a task done (PENDING_REVIEW_PROGRESS)
 *   1    — Review page: office/PM confirms it's actually complete
 * Confirmed live on 2026-08-23 against a real task for all three values —
 * JobTread's own `completed` field only ever becomes 1 at progress: 1
 * exactly; 0.75 leaves `completed` at 0, which is what makes the
 * pending-review state safe to write without it registering as "done" to
 * anyone/anything else reading JobTread directly.
 */
export async function setTaskProgress(env, taskId, progress) {
  const result = await queryJobTread(env, {
    updateTask: {
      $: { id: taskId, progress },
      task: {
        $: { id: taskId },
        id: {},
        progress: {},
        completed: {},
      },
    },
  });
  const task = result.updateTask?.task || {};
  return {
    progress: typeof task.progress === "number" ? task.progress : 0,
    completed: !!task.completed,
    pendingReview: task.progress === PENDING_REVIEW_PROGRESS,
  };
}
