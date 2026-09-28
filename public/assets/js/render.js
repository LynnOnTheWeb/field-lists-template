/*
 * Field Lists — shared page renderer
 * ------------------------------------------------------------------
 * A page works one of two ways:
 *
 *   LIVE TRADE: the page sets
 *     window.FIELD_LISTS_LIVE = { job: "main-st", trade: "framing" }
 *   before loading this file. On load, this file fetches
 *   /api/tasks/<job>/<trade> (see src/worker.js) and renders that. Tapping
 *   "Mark Done" writes back to JobTread through /api/tasks/<taskId>/progress
 *   as progress: 0.75 — real, not local-only, but deliberately NOT the same
 *   as JobTread's own completion (see README.md's "How completion works"
 *   section: a subcontractor marking a task done in the field flags it for
 *   office/PM review, it does not close the task out in JobTread by itself).
 *
 *   LIVE REVIEW: the page sets
 *     window.FIELD_LISTS_LIVE = { job: "main-st", review: true }
 *   instead. Fetches /api/review/<job> — every trade's pending-review
 *   items for that job combined into one list — and renders each with a
 *   trade badge and two actions instead of a checkbox: confirm complete
 *   (progress: 1, this is what actually closes the task out in JobTread)
 *   or send back to open (progress: 0).
 *
 *   There's also a legacy fallback, kept only for local testing without a
 *   live JobTread connection: if neither of the above is set and the page
 *   instead sets window.PROJECT_DATA directly, this file will render that
 *   data with completion state kept in localStorage rather than JobTread.
 *   Nothing in this template ships a page wired up this way by default.
 *
 * A page should use ONE of these, not more than one. This is the ONLY
 * place that knows how to turn task data into HTML — see README.md for
 * the data shape and how to add new pages.
 */
(function () {
  "use strict";

  var STORAGE_PREFIX = "fieldlists:complete:";

  // Local cache used only in STATIC mode (see file header). In LIVE mode
  // JobTread itself is the source of truth for completion state — see
  // renderCard()'s onToggle handler.
  function isMarkedComplete(taskId) {
    try {
      return window.localStorage.getItem(STORAGE_PREFIX + taskId) === "1";
    } catch (e) {
      return false; // localStorage unavailable (private mode, etc.) — just don't persist
    }
  }

  function setMarkedComplete(taskId, value) {
    try {
      if (value) {
        window.localStorage.setItem(STORAGE_PREFIX + taskId, "1");
      } else {
        window.localStorage.removeItem(STORAGE_PREFIX + taskId);
      }
    } catch (e) {
      /* ignore — nothing we can do if storage is blocked */
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else if (key === "html") node.innerHTML = attrs[key];
      else if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function formatUpdatedAt(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso; // fall back to raw string rather than hide it
    var datePart = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    var timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return "Updated " + datePart + " at " + timePart;
  }

  // ---------------- Lightbox ----------------

  var Lightbox = (function () {
    var rootEl, imgEl, captionEl, prevBtn, nextBtn;
    var images = [];
    var index = 0;
    var touchStartX = null;

    function build() {
      rootEl = el("div", { class: "lightbox", hidden: "hidden", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "lightbox__top" }, [
          el("span", { class: "lightbox__count" }),
          el("button", { class: "lightbox__close", type: "button", "aria-label": "Close photo viewer" }, [
            document.createTextNode("×"),
          ]),
        ]),
        el("div", { class: "lightbox__stage" }, [
          (prevBtn = el("button", { class: "lightbox__nav lightbox__nav--prev", type: "button", "aria-label": "Previous photo" }, [
            document.createTextNode("‹"),
          ])),
          (imgEl = el("img", { class: "lightbox__img", alt: "" })),
          (nextBtn = el("button", { class: "lightbox__nav lightbox__nav--next", type: "button", "aria-label": "Next photo" }, [
            document.createTextNode("›"),
          ])),
        ]),
        (captionEl = el("div", { class: "lightbox__caption" })),
      ]);
      document.body.appendChild(rootEl);

      rootEl.querySelector(".lightbox__close").addEventListener("click", close);
      rootEl.addEventListener("click", function (e) {
        if (e.target === rootEl) close();
      });
      prevBtn.addEventListener("click", function () { show(index - 1); });
      nextBtn.addEventListener("click", function () { show(index + 1); });

      document.addEventListener("keydown", function (e) {
        if (rootEl.hasAttribute("hidden")) return;
        if (e.key === "Escape") close();
        if (e.key === "ArrowLeft") show(index - 1);
        if (e.key === "ArrowRight") show(index + 1);
      });

      var stage = rootEl.querySelector(".lightbox__stage");
      stage.addEventListener("touchstart", function (e) {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      stage.addEventListener("touchend", function (e) {
        if (touchStartX === null) return;
        var dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
        touchStartX = null;
      });
    }

    function show(i) {
      if (!images.length) return;
      index = (i + images.length) % images.length;
      var current = images[index];
      imgEl.src = current.url;
      imgEl.alt = current.label || "";
      captionEl.textContent = current.label || "";
      rootEl.querySelector(".lightbox__count").textContent =
        images.length > 1 ? index + 1 + " of " + images.length : "";
      var multi = images.length > 1;
      prevBtn.style.display = multi ? "" : "none";
      nextBtn.style.display = multi ? "" : "none";
    }

    function open(imageList, startIndex) {
      if (!rootEl) build();
      images = imageList;
      show(startIndex || 0);
      rootEl.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
    }

    function close() {
      if (!rootEl) return;
      rootEl.setAttribute("hidden", "hidden");
      document.body.style.overflow = "";
    }

    return { open: open };
  })();

  // ---------------- Icons (inline, no external dependency) ----------------

  var ICON_CHECK =
    '<svg viewBox="0 0 16 16"><path d="M6.2 12.2 2.4 8.4l1.4-1.4 2.4 2.4 5.6-5.6 1.4 1.4z"/></svg>';
  var ICON_DOC =
    '<svg class="doc-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICON_LINK =
    '<svg class="doc-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>';
  var ICON_CAMERA_BADGE =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

  // ---------------- Card rendering ----------------

  // Attachments with type "image" render as photos (see renderCard). Every
  // other type renders as a labeled button. "pdf" and "link" get sensible
  // default labels/icons below; any other/unrecognized type still renders
  // safely as a generic "View File" button rather than being dropped.
  var DOC_TYPE_DEFAULTS = {
    pdf: { label: "View PDF", icon: ICON_DOC },
    link: { label: "View Website", icon: ICON_LINK },
  };

  function buildDocButton(att) {
    var defaults = DOC_TYPE_DEFAULTS[att.type] || { label: "View File", icon: ICON_DOC };
    var label = att.label || defaults.label;
    return el("a", {
      class: "doc-btn",
      href: att.url,
      target: "_blank",
      rel: "noopener",
      html: defaults.icon + '<span>' + escapeHtml(label) + "</span>",
    });
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  // Detects http(s):// and bare "www." URLs inside free-text task
  // descriptions and turns them into real, tappable links — added
  // 2026-08-25 after a real task description turned out to contain a
  // Dropbox meeting-notes link a sub had no way to open before this.
  //
  // Matches greedily up to the next whitespace/quote/angle-bracket, then
  // trims trailing punctuation that's almost always sentence punctuation
  // rather than part of the URL (a period or comma right after a link,
  // a closing paren wrapping it, etc.) — not perfect for every possible
  // URL shape, but right for the plain links this is meant to catch.
  var URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
  var URL_TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

  function linkifyHtml(text) {
    if (!text) return "";
    var parts = String(text).split(URL_PATTERN);
    var html = "";
    parts.forEach(function (part, i) {
      if (i % 2 === 0) {
        // Plain text between (or around) matched URLs — escape normally.
        html += escapeHtml(part);
        return;
      }
      var url = part;
      var trailing = "";
      var trailingMatch = url.match(URL_TRAILING_PUNCTUATION);
      if (trailingMatch) {
        trailing = trailingMatch[0];
        url = url.slice(0, url.length - trailing.length);
      }
      if (!url) {
        // Trimming ate the whole "match" (e.g. a stray "www." with
        // nothing after it) — just show the original text, don't link it.
        html += escapeHtml(part);
        return;
      }
      var href = /^www\./i.test(url) ? "https://" + url : url;
      html +=
        '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + escapeHtml(url) + "</a>" + escapeHtml(trailing);
    });
    return html;
  }

  // Shared by both card types below: location badge (or trade badge, on
  // the Review page), name, description, photos, and document buttons.
  // Neither card type's action row is built here — that part differs too
  // much between "one checkbox" (trade page) and "two buttons" (review).
  function appendTaskBody(card, task, opts) {
    opts = opts || {};
    var images = (task.attachments || []).filter(function (a) { return a.type === "image"; });
    var docs = (task.attachments || []).filter(function (a) { return a.type !== "image"; });

    if (opts.showTradeBadge && task.trade) {
      card.appendChild(el("span", { class: "task-card__location", text: task.trade }));
    } else if (task.location) {
      card.appendChild(el("span", { class: "task-card__location", text: task.location }));
    }

    card.appendChild(el("h2", { class: "task-card__name", text: task.name || "Untitled item" }));

    if (task.description) {
      card.appendChild(el("p", { class: "task-card__description", html: linkifyHtml(task.description) }));
    }

    if (images.length) {
      var photoWrap = el("div", { class: "task-card__photo-wrap" });
      var photoBtn = el("button", { class: "task-card__photo-btn", type: "button", "aria-label": "View photo" });
      var img = el("img", {
        class: "task-card__photo",
        src: images[0].url,
        alt: images[0].label || task.name || "Photo",
        loading: "lazy",
      });
      photoBtn.appendChild(img);
      if (images.length > 1) {
        photoBtn.appendChild(
          el("span", { class: "task-card__photo-count", html: ICON_CAMERA_BADGE + "+" + (images.length - 1) + " more" })
        );
      }
      photoBtn.addEventListener("click", function () {
        Lightbox.open(images, 0);
      });
      photoWrap.appendChild(photoBtn);
      card.appendChild(photoWrap);
    }

    if (docs.length) {
      var docRow = el("div", { class: "task-card__docs" });
      docs.forEach(function (d) { docRow.appendChild(buildDocButton(d)); });
      card.appendChild(docRow);
    }
  }

  // Trade page card: one checkbox. In LIVE mode this toggles a task
  // between open (progress: 0) and pending review (progress: 0.75) — it
  // deliberately never sets progress: 1 itself; see file header and
  // README.md's "How completion works" section. In the legacy local-only
  // fallback mode it's a plain localStorage toggle instead.
  function renderCard(task, onToggle, live) {
    // LIVE mode: task.pendingReview (from the JobTread progress field
    // just fetched) is the source of truth. Legacy fallback mode: local
    // storage only, see file header.
    var done = live ? !!task.pendingReview : isMarkedComplete(task.jobTreadTaskId);

    var card = el("article", {
      class: "task-card" + (done ? " task-card--complete" : ""),
      "data-task-id": task.jobTreadTaskId,
    });

    appendTaskBody(card, task);

    var completeRow = el("div", { class: "task-card__complete-row" });
    var btn = el("button", {
      class: "complete-btn" + (done ? " complete-btn--done" : ""),
      type: "button",
      "aria-pressed": done ? "true" : "false",
    }, [
      el("span", { class: "complete-btn__box", html: ICON_CHECK }),
      el("span", { text: done ? "Marked Done" : "Mark Done" }),
    ]);
    var note = el("p", {
      class: "task-card__complete-note",
      text: !live ? "Saved on this device only — not sent to JobTread yet." : done ? "Waiting on office review." : "",
    });

    function paint() {
      task.pendingReview = done; // keep the in-memory task in sync so updateOpenCount() stays accurate
      card.classList.toggle("task-card--complete", done);
      btn.classList.toggle("complete-btn--done", done);
      btn.setAttribute("aria-pressed", done ? "true" : "false");
      btn.lastChild.textContent = done ? "Marked Done" : "Mark Done";
    }

    btn.addEventListener("click", function () {
      var next = !done;

      if (!live) {
        done = next;
        setMarkedComplete(task.jobTreadTaskId, done);
        paint();
        if (onToggle) onToggle();
        return;
      }

      // LIVE mode: update the screen right away so it feels instant, but
      // this is a real write to JobTread, not a local flag — if it fails,
      // undo the flip and say so rather than leaving the UI lying about
      // what's actually saved.
      done = next;
      paint();
      btn.disabled = true;
      note.textContent = "Saving…";
      if (onToggle) onToggle();

      fetch("/api/tasks/" + encodeURIComponent(task.jobTreadTaskId) + "/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: next ? 0.75 : 0 }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("bad response");
          return res.json();
        })
        .then(function (result) {
          done = !!result.pendingReview;
          note.textContent = done ? "Waiting on office review." : "";
          paint();
          if (onToggle) onToggle();
        })
        .catch(function () {
          done = !next; // revert
          note.textContent = "Couldn't save to JobTread — try again.";
          paint();
          if (onToggle) onToggle();
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
    completeRow.appendChild(btn);
    completeRow.appendChild(note);
    card.appendChild(completeRow);

    return card;
  }

  // Review page card: two buttons instead of a checkbox. Always LIVE —
  // there's no local-only equivalent of the review queue. Confirming is
  // the only user-facing action anywhere on the site that sets
  // progress: 1, i.e. actually closes the task out in JobTread — see
  // README.md's "How completion works" section. `onResolved(taskId)` is
  // called after either action succeeds, so the page can remove the card
  // and update the count.
  function renderReviewCard(task, onResolved) {
    var card = el("article", { class: "task-card", "data-task-id": task.jobTreadTaskId });
    appendTaskBody(card, task, { showTradeBadge: true });

    var actionRow = el("div", { class: "task-card__complete-row task-card__review-actions" });
    var confirmBtn = el("button", { class: "complete-btn complete-btn--done", type: "button" }, [
      el("span", { class: "complete-btn__box", html: ICON_CHECK }),
      el("span", { text: "Confirm Complete" }),
    ]);
    var rejectBtn = el("button", { class: "complete-btn", type: "button" }, [
      el("span", { text: "↩ Not Actually Done" }),
    ]);
    var note = el("p", { class: "task-card__complete-note" });

    function act(progress, savingText) {
      confirmBtn.disabled = true;
      rejectBtn.disabled = true;
      note.textContent = savingText;

      fetch("/api/tasks/" + encodeURIComponent(task.jobTreadTaskId) + "/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: progress }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("bad response");
          return res.json();
        })
        .then(function () {
          if (onResolved) onResolved(task.jobTreadTaskId);
        })
        .catch(function () {
          note.textContent = "Couldn't save to JobTread — try again.";
          confirmBtn.disabled = false;
          rejectBtn.disabled = false;
        });
    }

    confirmBtn.addEventListener("click", function () { act(1, "Confirming…"); });
    rejectBtn.addEventListener("click", function () { act(0, "Sending back to open…"); });

    actionRow.appendChild(confirmBtn);
    actionRow.appendChild(rejectBtn);
    actionRow.appendChild(note);
    card.appendChild(actionRow);

    return card;
  }

  // ---------------- Page assembly ----------------

  function buildHeader(project) {
    var header = document.querySelector("[data-field-header]");
    if (!header) return;
    header.innerHTML = "";
    header.appendChild(el("div", { class: "page-header__inner" }, [
      el("p", { class: "page-header__project", text: project.name || "" }),
      el("p", { class: "page-header__trade", text: project.trade || "" }),
      el("div", { class: "page-header__meta" }, [
        el("span", { class: "page-header__count", "data-open-count": "true" }),
        project.updatedAt
          ? el("span", { class: "page-header__updated", text: formatUpdatedAt(project.updatedAt) })
          : null,
      ]),
    ]));
  }

  // Trade page (STATIC or LIVE): one checkbox per card, toggled in place.
  function renderPage(data, live) {
    var project = data.project || {};
    var tasks = data.tasks || [];

    document.title = (project.name ? project.name + " — " : "") + (project.trade || "Field List");
    buildHeader(project);

    var listEl = document.querySelector("[data-task-list]");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!tasks.length) {
      listEl.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "empty-state__icon", text: "✅" }),
        el("p", { text: "No open items for this trade right now." }),
      ]));
      updateOpenCount(tasks, live);
      return;
    }

    tasks.forEach(function (task) {
      listEl.appendChild(renderCard(task, function () { updateOpenCount(tasks, live); }, live));
    });

    updateOpenCount(tasks, live);
  }

  function updateOpenCount(tasks, live) {
    var openCountEl = document.querySelector("[data-open-count]");
    if (!openCountEl) return;
    var open = tasks.filter(function (t) {
      return live ? !t.pendingReview : !isMarkedComplete(t.jobTreadTaskId);
    }).length;
    openCountEl.textContent = open + (open === 1 ? " Open Item" : " Open Items");
  }

  // Review page (LIVE only): two buttons per card. Resolving a card
  // (either action) removes it from the page entirely rather than toggling
  // it in place — once it's confirmed or sent back to open, it no longer
  // belongs in the review queue.
  function renderReviewPage(data) {
    var project = data.project || {};
    var tasks = (data.tasks || []).slice();

    document.title = (project.name ? project.name + " — " : "") + "Needs Review";
    buildHeader(project);

    var listEl = document.querySelector("[data-task-list]");
    if (!listEl) return;

    function updateCount() {
      var countEl = document.querySelector("[data-open-count]");
      if (countEl) {
        var n = tasks.length;
        countEl.textContent = n + (n === 1 ? " Item Awaiting Review" : " Items Awaiting Review");
      }
    }

    function showEmptyState() {
      listEl.innerHTML = "";
      listEl.appendChild(el("div", { class: "empty-state" }, [
        el("div", { class: "empty-state__icon", text: "👍" }),
        el("p", { text: "Nothing waiting on review right now." }),
      ]));
    }

    function renderList() {
      listEl.innerHTML = "";
      if (!tasks.length) {
        showEmptyState();
        return;
      }
      tasks.forEach(function (task) {
        listEl.appendChild(
          renderReviewCard(task, function (resolvedTaskId) {
            tasks = tasks.filter(function (t) { return t.jobTreadTaskId !== resolvedTaskId; });
            updateCount();
            if (!tasks.length) showEmptyState();
            else {
              var node = listEl.querySelector('[data-task-id="' + resolvedTaskId + '"]');
              if (node) node.remove();
            }
          })
        );
      });
    }

    renderList();
    updateCount();
  }

  function renderLoadError(message) {
    var listEl = document.querySelector("[data-task-list]");
    if (!listEl) return;
    listEl.innerHTML = "";
    listEl.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "empty-state__icon", text: "⚠️" }),
      el("p", { text: message }),
    ]));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var live = window.FIELD_LISTS_LIVE;

    if (live && live.review) {
      fetch("/api/review/" + encodeURIComponent(live.job))
        .then(function (res) {
          if (!res.ok) throw new Error("bad response");
          return res.json();
        })
        .then(function (data) {
          renderReviewPage(data);
        })
        .catch(function () {
          renderLoadError("Couldn't load the review list right now. Check your connection and reload the page.");
        });
      return;
    }

    if (live) {
      // LIVE mode never falls back to window.PROJECT_DATA / sample data on
      // a failed fetch — showing a subcontractor placeholder "SAMPLE" data
      // as if it were real would be worse than a plain error message.
      fetch("/api/tasks/" + encodeURIComponent(live.job) + "/" + encodeURIComponent(live.trade))
        .then(function (res) {
          if (!res.ok) throw new Error("bad response");
          return res.json();
        })
        .then(function (data) {
          renderPage(data, true);
        })
        .catch(function () {
          renderLoadError("Couldn't load tasks right now. Check your connection and reload the page.");
        });
      return;
    }

    if (window.PROJECT_DATA) {
      renderPage(window.PROJECT_DATA, false);
    }
  });
})();
