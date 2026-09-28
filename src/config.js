/*
 * Field Lists — per-job configuration
 * ------------------------------------------------------------------
 * One entry per job "slug" (the first segment of the URL, e.g. the
 * "main-st" in /main-st/framing). Add a new job by adding a new key
 * here — see README.md "Add a job" section for the full walkthrough.
 *
 * jobtreadJobId  — the real JobTread job's id. The easiest way to find
 *                  it: open the job in JobTread and look at the URL,
 *                  e.g. app.jobtread.com/jobs/XXXXXXXXXXXX/... — the id
 *                  is that XXXXXXXXXXXX segment. (You can also get it
 *                  from the API's organization.jobs list if you're
 *                  comfortable with that.)
 * displayName    — what subcontractors see at the top of the page. This
 *                  can be different from the job's name inside JobTread
 *                  on purpose — e.g. if your JobTread job is named
 *                  something internal like "123 Main St - Draft", you
 *                  can set displayName to just "123 Main St" here
 *                  without renaming anything in JobTread itself.
 * trades         — maps a URL-friendly trade slug (e.g. "electrical") to
 *                  the EXACT JobTread taskType name it should pull (e.g.
 *                  "Electric"). JobTread's own naming doesn't always
 *                  match the obvious slug spelling — check your
 *                  account's task types if you're not sure (JobTread ->
 *                  Settings -> Task Types, or ask the JobTread API for
 *                  organization.taskTypes).
 *
 *                  Adding a trade is ONE line here — nothing else.
 *                  src/pages.js generates that trade's page on the fly;
 *                  there's no per-trade HTML file to create and no
 *                  index.html link to remember.
 *
 *                  The page's on-screen title is auto-generated from the
 *                  slug (labelFromSlug() below) — "interior-finishes"
 *                  becomes "Interior Finishes", etc. Every ordinary slug
 *                  produces the right label on its own EXCEPT acronyms,
 *                  which need to be listed in ACRONYM_SLUG_WORDS below or
 *                  they'll title-case wrong (e.g. "hvac" -> "Hvac"
 *                  instead of "HVAC").
 *
 * rooms          — a fixed list of room/space names for this job, used
 *                  to loosely match a room name mentioned in a task's
 *                  name/description (see parseLocation() in
 *                  src/jobtread.js). Every job gets its own list; there
 *                  is no shared/global room list. Leave this as an empty
 *                  array ([]) if you don't want location matching for a
 *                  job — do NOT delete the `rooms` key entirely, the
 *                  site expects it to exist (see README's troubleshooting
 *                  section).
 */

// Trade slugs whose words should render as an all-caps acronym in the
// auto-generated page title (labelFromSlug() below) instead of normal
// title-case — e.g. "hvac" -> "HVAC", not "Hvac". Add a slug's word here
// if one of your trades is also an acronym (e.g. "hoa").
const ACRONYM_SLUG_WORDS = new Set(["hvac"]);

// Turns a trade slug (the config.js key, e.g. "interior-finishes") into the
// on-screen page title ("Interior Finishes") — see the big comment above.
// Every ordinary slug produces the right label on its own except
// acronyms, which are listed in ACRONYM_SLUG_WORDS above.
export function labelFromSlug(slug) {
  return slug
    .split("-")
    .map((word) =>
      ACRONYM_SLUG_WORDS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

export const JOBS = {
  // ------------------------------------------------------------------
  // EXAMPLE JOB — replace this whole block with your own job(s). The
  // key ("example-job") becomes the first segment of every URL for this
  // job, e.g. /example-job/framing. See README.md "Add a job" for the
  // full walkthrough, including how to find your JobTread job id and
  // your account's exact taskType names.
  // ------------------------------------------------------------------
  "example-job": {
    jobtreadJobId: "REPLACE_WITH_YOUR_JOBTREAD_JOB_ID",
    displayName: "Example Job — replace me",

    // A reasonable starter list covering common residential trades.
    // Delete any line you don't need, and add more the same way — the
    // key is your URL slug, the value must be the EXACT taskType name
    // as it appears in JobTread.
    trades: {
      framing: "Framing",
      electrical: "Electric",
      plumbing: "Plumbing",
      foundation: "Foundation",
      concrete: "Concrete",
      roofing: "Roofing",
      painting: "Painting",
      excavation: "Excavation",
      siding: "Siding",
      exterior: "Exterior",
      carpentry: "Carpentry",
      insulation: "Insulation",
      drywall: "Drywall",
      landscaping: "Landscaping",
      hvac: "HVAC",
      tile: "Tile",
    },

    // Room/space names for this job, used for loose location matching
    // against task text (see the big comment above and README §7-style
    // notes on how matching works). Leave as [] if you don't want this
    // feature for this job — don't delete the key.
    rooms: [],
  },
};
