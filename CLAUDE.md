# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page trip planner (Taipei/Ishigaki/Korea trip) built as one static HTML file with inline CSS/JS — no build step, no package.json, no framework. `index.html` is the live app, served via GitHub Pages (`.nojekyll` present, repo root is the publish source).

There is no test suite, linter, or build command. "Running" the app means opening `index.html` in a browser or serving the directory with any static file server (e.g. `python3 -m http.server`). To sanity-check JS after an edit without a browser, extract the `<script>` body and run it through `node -e "new Function(...)"` — there's no formal syntax-check command configured.

## Repo layout

- `index.html` — the actual planner app (single file, ~1200 lines: CSS in `<style>`, all logic in one `<script>` at the bottom).
- `export-to-claude.html` — standalone utility page that pulls all sheets from the same Google Sheet and formats them as text to paste into a Claude chat. Self-contained, not linked from `index.html`.
- `index1.0.html`, `index2.html`, `index3.html`, `current index file/index.html` — older/backup snapshots of the planner, not wired into the site and not under active development. Don't edit these when asked to change "the planner" — that means `index.html`.
- No other source directories.

## Architecture (index.html)

**Persistence: Google Sheets, no server code of your own.** The app has no backend. All state lives in a Google Sheet (`SHEET_ID` near the top of the `<script>`), read via the public Sheets API (`API_KEY`, read-only `GET`) and written via a Google Apps Script Web App endpoint (`SCRIPT_URL`, `POST` with `mode:'no-cors'`, fire-and-forget). Both keys are hardcoded in the client-side script since this is a static page with no server to hide them behind — that's an intentional constraint of the deployment, not an oversight to silently "fix."

**Two persistence shapes**, chosen per-sheet via the `SH` map:
- **KV sheets** (`diving`, `smile`, `transport`): flat key→value rows, used for form fields addressed by DOM element `id`. Loaded with `kvLoad`/`fillKV`, saved with `kvQ` (debounced 1.5s) → `kvFlush`.
- **List sheets** (everything else — `timeline`, `flights`, `accom`, `todo`, `buy`, etc.): the entire array for that tab is serialized as one JSON blob in a single cell. Loaded with `listLoad`, saved with `listQ` (debounced 1.5s) → `listFlush`.

Both write paths debounce and show state via `setSS()` driving the sync dot in the header (`ok`/`saving`/`err`).

**Tabs/panels.** Each nav tab (`.tab[data-tab=X]`) shows/hides a `.panel#panel-X`. `lists` holds one array per list-sheet type; `renderers` maps each type to its `render*()` function, which re-renders that panel's `#<type>-list` container from `lists[type]`.

**Per-item card pattern.** Every list item renders via the shared `cardShell(listType, item, idx, opts, bodyHtml)` helper, which builds the collapsible card header (drag handle, chevron, title, meta badge, ↑/↓ reorder buttons) and body. `idx` must be the item's real index in `lists[type]` — inline `onXXX` handlers reference `lists[type][idx]` directly by that index, so any custom sort in a `render*()` function must render a *sorted copy* while still resolving each item's true array index (via `lists[type].findIndex(x => x.id === t.id)`) for the handlers and for `cardShell`'s `idx` argument. See `renderTimeline()` and `renderTodo()` for this pattern — both are auto-sorted (by date) and pass `noReorder:true` to `cardShell` since manual drag/↑↓ reordering doesn't make sense when order is computed.
`opts.noReorder` also switches the header from CSS grid to a flex layout (used by any panel where item order isn't user-controlled).

**IDs, not indices, identify items.** Every item has a stable `id` (`uid()`), assigned on creation or backfilled on load via `ensureIds()`. Expand/collapse state (`expandedIds`), drag-and-drop reordering (`dragStart`/`dragDrop`), and the sort-then-locate pattern above all key off `id`, not array position — array position is only used transiently inside a single render pass.

**Overview tab is derived, not stored.** `renderOverview()` builds a read-only itinerary by merging `timeline`, `accom`, `places`, `food`, and `buy` entries and grouping by `canonGroup()` (Transit/Taiwan/Ishigaki/Korea). It has no sheet of its own — don't add a `todo`-style CRUD list for it.

**Auto-generated timeline entries.** `computeAutoTimelineItems()` synthesizes timeline rows from flights/accom/dive/SMILE dates so they show up on the Timeline tab without manual entry; these are marked `auto:true` and render with a "Edit in {source} tab →" button (`jumpToTab`) instead of inline edit fields, since editing them means editing the source tab.

**Adding a new list-backed tab** means: add the sheet name to `SH`, an empty array to `lists`, a case in `defaultItem()`, a `render*()` function following the existing pattern (map over `lists[type]`, call `cardShell`), register it in `renderers`, and add the panel markup + nav tab in the HTML.
