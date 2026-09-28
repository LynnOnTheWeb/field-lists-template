# Field Lists

A mobile-first field task list for construction subcontractors, built on top of JobTread. Each page is a clean, phone-friendly punch list for **one job and one trade** — a digital replacement for handing a subcontractor a printed list, with easy access to photos, plan screenshots, and PDFs already attached to the task in JobTread.

---

## Before you start: what you're actually setting up

This project runs on two free services:

- **GitHub** — holds the code (you'll get your own copy of this repository).
- **Cloudflare** — actually runs the site, and rebuilds it automatically every time you save a change on GitHub.

Getting these two connected to each other is **the most technical part of this whole setup** — everything after that is just editing one text file. If you've never used GitHub or Cloudflare before, that's completely fine. Every step below is written to be followed exactly as written, and if you get stuck or see an error message you don't understand, **paste it into Claude or ChatGPT and ask what it means** — that's a perfectly normal way to get through this, and it's exactly how this project itself was built. You do not need to know how to code to finish this setup.

Budget 20–40 minutes for the one-time setup below. After that, adding a new job or trade takes under a minute (see "Ongoing maintenance").

---

## 1. What this gives you

- One URL per job and trade (e.g. `yoursite.com/main-st/framing`) that a subcontractor can open on their phone — no login, no app to install.
- Task name, description, location, and any photos or PDFs attached to that task in JobTread, shown as simple cards.
- A **two-step "done" workflow**: a subcontractor marking something done in the field flags it for office review — it does not close the task out in JobTread by itself. A separate Review page (combining every trade for that job) is where your office actually confirms it complete. See "How completion works" below.
- Task descriptions auto-link any URL they contain, so a Dropbox link pasted into a JobTread task just works from the field.

**What this is not:** a full replacement for JobTread. It's a read-focused, field-friendly window into task data that's already in JobTread — JobTread stays the single source of truth for everything.

---

## 2. What you'll need before you begin

- A free [GitHub](https://github.com) account.
- A free [Cloudflare](https://www.cloudflare.com) account.
- A JobTread account with API access — specifically a **Grant Key**. In JobTread, this is generated under your organization's API/integrations settings. If you can't find it, JobTread's own support can point you to it — search their help center for "Pave API" or "Grant Key."
- The **exact JobTread job ID(s)** for the job(s) you want to show, and the **exact taskType names** your account uses (e.g. your account might call it "Electric" rather than "Electrical"). Both are covered in step 5 below.

You do **not** need Node.js, npm, git, or a code editor installed on your computer — everything below can be done from a web browser, through GitHub's and Cloudflare's own websites.

---

## 3. Step 1 — Get your own copy of this repository

1. On GitHub, open this template repository.
2. Click the green **"Use this template"** button near the top, then **"Create a new repository."**
3. Give it any name you like (e.g. `my-field-lists`), leave it set to **Public** or set it to **Private** — either works, this choice doesn't affect anything else below — and click **Create repository**.

You now have your own copy of this code, completely separate from the original template. Every change from here on happens in *your* copy.

---

## 4. Step 2 — Connect it to Cloudflare

1. Log into [the Cloudflare dashboard](https://dash.cloudflare.com) (create a free account first if you don't have one).
2. In the left sidebar, go to **Workers & Pages**.
3. Click **Create**, then choose **Workers**, then look for the option to **Connect to Git** / **Import a repository** (Cloudflare's exact wording changes from time to time — look for anything mentioning GitHub).
4. Authorize Cloudflare to access your GitHub account if asked, then select the repository you created in Step 1.
5. Cloudflare will detect this is a Workers project (it reads `wrangler.jsonc` in the repo automatically) and show you a deploy screen. You can leave every setting on its default. Click **Save and Deploy**.
6. Wait for the first build to finish — it usually takes under a minute. When it's done, Cloudflare gives you a URL like `your-project-name.your-subdomain.workers.dev`. That's your site's address.

From now on, **every time you save a change to your GitHub repository, Cloudflare automatically rebuilds and redeploys your site within a minute or two** — you never need to come back to this step again.

---

## 5. Step 3 — Add your JobTread Grant Key (as a secret, not in the code)

Your Grant Key is a credential — it should never be typed into a code file or committed to GitHub, since GitHub repositories (even private ones) shouldn't hold live credentials. Cloudflare has a separate, encrypted place for exactly this.

1. In the Cloudflare dashboard, open the Worker you just created.
2. Go to **Settings → Variables and Secrets**.
3. Add a new secret named exactly `JOBTREAD_GRANT_KEY`, and paste in your JobTread Grant Key as the value. Make sure it's added as a **Secret** (encrypted), not a plain variable.
4. Save. Cloudflare will redeploy the Worker with the new secret available to it.

**A gotcha worth knowing about:** Cloudflare has two different places that look similar — one for variables available while your project *builds*, and one for variables available while it *runs*. `JOBTREAD_GRANT_KEY` needs to be in the runtime one (Settings → Variables and Secrets, as above) — if your site deploys fine but every page says it "couldn't load tasks from JobTread," this is the first thing to check.

---

## 6. Step 4 — Edit `src/config.js` with your own job(s)

This is the one file you'll come back to whenever you want to add a job or a trade. Open `src/config.js` in your GitHub repository (click the file, then the pencil/edit icon), and replace the example job with your own.

**Finding your JobTread job ID:** open the job in JobTread and look at the web address — it looks like `app.jobtread.com/jobs/XXXXXXXXXXXX/...`. The `XXXXXXXXXXXX` part is your job ID.

**Finding your exact taskType names:** these are the trade categories your JobTread account uses (Settings → Task Types in JobTread, or ask whoever manages your JobTread account). The value on the right side of each line in `trades` below must match **exactly**, including capitalization — JobTread's naming doesn't always match the obvious spelling (for example, an account might use `"Electric"` rather than `"Electrical"`).

A single job looks like this:

```js
export const JOBS = {
  "main-st": {
    jobtreadJobId: "your-real-jobtread-job-id",
    displayName: "123 Main St",
    trades: {
      framing: "Framing",
      electrical: "Electric",
      plumbing: "Plumbing",
      // add or remove lines here — the left side is the URL slug,
      // the right side must be the exact JobTread taskType name
    },
    rooms: [],
  },
};
```

- The key (`"main-st"` above) becomes the first part of every URL for that job, e.g. `yoursite.com/main-st/framing`. Use only lowercase letters, numbers, and hyphens.
- `displayName` is what a subcontractor sees at the top of the page — it can be different from the job's name inside JobTread.
- `rooms` is optional room/location matching — see "Optional: room matching" below. Leave it as `[]` if you don't want this.

**Adding a second job** just means adding a second entry to the same object:

```js
export const JOBS = {
  "main-st": { /* ... */ },
  "oak-ave": {
    jobtreadJobId: "a-different-jobtread-job-id",
    displayName: "456 Oak Ave",
    trades: { /* ... */ },
    rooms: [],
  },
};
```

Once you save the change (commit it), Cloudflare rebuilds automatically and your new job or trade is live within a minute or two — **no other file needs to change.**

---

## 7. Ongoing maintenance: adding a trade or a job later

- **New trade on an existing job:** add one line to that job's `trades` object in `src/config.js`. That's it — the page is generated automatically the moment the deploy finishes.
- **New job:** add one new entry to the `JOBS` object, same shape as above.
- **Removing a trade or job:** delete its line/entry. The page stops existing; anyone with an old link gets a normal "page not found."

There are no other files to touch, no HTML pages to create, and nothing to remember to link from anywhere else.

---

## 8. Optional: room matching

If you set `rooms` to a list of names (instead of `[]`), the site will try to detect which room/area a task belongs to by loosely matching those names against the task's name and description text, and show it as a small badge on the card:

```js
rooms: ["Kitchen", "Master Bath 1", "Garage", "Back Yard"],
```

This is a plain substring match (case-insensitive, tolerant of spacing) — it isn't AI-powered and won't catch wording variants (e.g. "Bathroom 3" won't match a room list entry of "Bath 3"; you'd need both spelled out, or matching phrasing in JobTread). If a task's text doesn't match anything in the list, no badge is shown — nothing breaks.

---

## 9. How completion works (two-step, by design)

This intentionally does **not** let a subcontractor close out a task directly in JobTread:

1. **On a trade page**, tapping the checkbox marks it "Marked Done" and writes a real (but intermediate) value back to JobTread — it flags the task as awaiting office review, but does **not** set JobTread's own completion status. A subcontractor can un-check it themselves if they tapped it by mistake.
2. **On the Review page** (`yoursite.com/main-st/review`), your office or a PM sees every trade's pending items for that job in one combined list, and either **Confirm Complete** (this is what actually closes the task out in JobTread) or **Not Actually Done** (sends it back to open).

This exists because handing subcontractors the ability to instantly close out tasks in JobTread directly turned out to be too easy to get wrong in practice — this gives the office a chance to verify field-reported work first.

---

## 10. Sharing pages with subcontractors

There's no login system. You give each subcontractor a direct link to their own trade page (e.g. `yoursite.com/main-st/framing`) — text it, put it in JobTread, however you'd normally share a link. Pages are marked so they won't show up in search engines, but the URLs themselves are plain and guessable — this is a deliberate simplicity trade-off, not a security boundary. Don't put anything on a page that wouldn't be fine for anyone who guessed or was forwarded the link to see.

---

## 11. Troubleshooting

**Every page says "couldn't load tasks from JobTread right now."**
Almost always the `JOBTREAD_GRANT_KEY` secret — check that it's set under Settings → *Variables and Secrets* (the runtime one, not a build-time variable) in your Cloudflare Worker, and that you copied the whole key with no extra spaces.

**A URL like `/main-st/framing` gives a 404 / page not found.**
Check `src/config.js`: the job slug and trade slug in the URL both need to exist there exactly (matching spelling, all lowercase). If you just edited config.js, also check the file for a typo — a JavaScript syntax error anywhere in it will make deploys fail silently in a way that can look like a 404. GitHub will usually show you the deploy failed if you check Cloudflare's Deployments tab.

**I deleted the `rooms` list entirely instead of setting it to `[]`.**
Don't do this — the site expects every job to have a `rooms` key, even if it's empty. Removing it entirely will break every page for that job. Set it to `rooms: []` instead.

**Nothing seems to update after I edit and save a file on GitHub.**
Check the **Deployments** tab in your Cloudflare Worker — it should show a new deployment starting within a few seconds of your save. If a deployment shows a red/failed status, click into it to see the error (usually a JavaScript syntax mistake in whatever file you last edited).

**I'm stuck on something not covered here.**
Copy the exact error message (or describe what you're seeing) and paste it into Claude or ChatGPT along with "I'm setting up a Cloudflare Worker connected to a GitHub repo" for context — this gets you unstuck faster than guessing.

---

## 12. How it's built, briefly

- **Hosting:** Cloudflare Workers with Static Assets — not Cloudflare Pages. Cloudflare builds and deploys automatically through its GitHub-connected CI/CD ("Workers Builds") every time you push to your repository's default branch.
- **No build step, no framework.** Plain HTML/CSS/JavaScript on the front end; the Worker's own code (`src/`) is plain JavaScript (ES modules) too.
- **`src/worker.js`** is the entry point — it serves the JSON API routes, generates every HTML page (trade pages, the Review page, the directory) on the fly from `src/config.js`, and falls through to static files (CSS/JS/favicon) for everything else.
- **`src/jobtread.js`** is the only file that talks to JobTread's API, and the only place that ever writes a task's progress back.
- **`src/pages.js`** turns `src/config.js`'s data into the actual HTML for each page — this is what makes adding a trade a one-line change.
- **`src/config.js`** is your per-job configuration — the only file you should need to edit regularly.
- **`public/assets/js/render.js`** is the shared front-end script that turns a `{ project, tasks }` JSON payload into the page you actually see, and handles the "Mark Done" / "Confirm Complete" actions.

---

## Security note

There's no authentication on any page — anyone with a link can view it, and pages that write back to JobTread (marking something done, confirming complete) do so without a login check. This mirrors the tradeoff most simple field-tool setups make: convenience for subcontractors over access control. If that's not acceptable for your use case, consider adding [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in front of the site, or per-subcontractor unguessable link tokens, before relying on this for anything sensitive.

---

## License

MIT — see [LICENSE](./LICENSE). Idea and original use case by Lynn, written by Claude. Use it, modify it, deploy it for your own jobs, commercially or otherwise, with no obligation to share changes back or ask permission. No warranty is provided; you're responsible for your own deployment and data.
