# NadoPasana UI/UX redesign

This document tracks the UI/UX redesign described in the design brief (ten confirmed decisions: hybrid modern–musical–cultural identity, ivory/burgundy/antique-gold palette with light and dark themes, adaptive navigation, role-adaptive dashboards, context-aware motion, editorial typography, bento layouts with selective glass, functional-only musical visuals, device-specific UX, product-level scope).

It holds the Phase 0 audit, the design system (tokens, type, components), the plan for every later phase, and a progress log. Update it in the same pull request as the code it describes.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repository audit, UX inventory, plan | Done (this document) |
| 1 | Design tokens, light/dark theme, fonts, colour refactor | Done |
| 2 | Shared shell and navigation (sidebar, bottom nav, URL routes) | Done |
| 3 | Teacher workspace and batch calendar (flagship) | Done |
| 4 | Owner command center | Done |
| 5 | Student Riyaz studio | Done |
| 6 | Polish, accessibility, performance, QA | Done |

---

## 1. Current state (Phase 0 audit)

### 1.1 Stack and UI architecture

- **Frontend:** React 19 + Vite 8 in `apps/web`, plain JavaScript (JSX), no router, no UI kit. Icons from `lucide-react`. Strings from `packages/localization` (English, Marathi, Hindi).
- **Styling:** four global stylesheets, no CSS modules.
  - `src/styles.css` (347 lines): tokens in `:root`, studio shell, landing page, practice and library screens.
  - `src/portal.css` (151 lines): sign-in, Owner and Teacher screens, batch calendar, timetable, assignments.
  - `src/SaSustainFeedback.css`, `src/practiceStudio.css`: practice feedback.
- **Shells (two, different):**
  - `App` in `src/main.jsx`: fixed left sidebar + sticky top bar with breadcrumbs. Used by the student portal and the offline/guest studio.
  - `PortalShell` in `src/PortalShell.jsx`: sticky top header with tab buttons. Used by the Owner and Teacher portals.
- **Navigation state:** page keys in React state (`route`, `page`), not in the URL. Refresh returns to the first page; the browser Back button leaves the app; there are no deep links.
- **Entry:** `src/index.jsx` renders `AccountRoot`, which picks login, guest studio, or a role portal from the stored session.
- **Data:** `packages/api-client` (fetch wrapper) against the FastAPI backend; `useApi` + `LoadState` in `PortalShell.jsx` give loading/error/empty states for portal lists.
- **Tests:** `node --test` with server-side rendering of components (`test/portal.test.js` and others). 147 web tests and 57 API tests pass at the start of the redesign.

### 1.2 Page inventory

| Role | Page | Component | Notes |
| --- | --- | --- | --- |
| Everyone | Sign in | `LoginPage` (`AccountRoot.jsx`) | Centred card; dark only. |
| Guest | Landing | `Landing` (`main.jsx`) | Marketing page for the offline studio. |
| Guest / Student | Home, Practice, Library, Alankar, Routines, Progress, Settings, Results | `App` (`main.jsx`), `PracticeStudio.jsx`, `Results.jsx` | Sidebar shell. Practice uses the real microphone pipeline. |
| Student | Timetable | `StudentTimetable.jsx` | Day cards, already agenda-style. |
| Student | Assignments | `Assignments.jsx` (`StudentAssignments`) | Answer note, file upload, links, teacher feedback. |
| Teacher | Dashboard | `TeacherPortal.jsx`, `BatchCalendar.jsx` | Two stat tiles, week grid 06:00–22:00, roster. |
| Teacher | Assignments | `Assignments.jsx` (`TeacherAssignments`) | Create/edit, attachments, review answers. |
| Owner | Overview | `OwnerPortal.jsx` | Five number tiles. |
| Owner | Accounts, Courses, Enrollments, Batches | `OwnerPortal.jsx` | Form column + data table. |

### 1.3 Prioritized UX and design issues

**P1 — blocks the brief or harms daily use**

1. **Dark only, off-brand palette.** Navy, violet and teal with gold. There is no light theme, no theme toggle, and `color-scheme: dark` is hard-coded. The brief asks for ivory/burgundy/antique gold in both themes.
2. **Colour is not tokenised.** 145 hard-coded colour literals (118 in `styles.css`, 18 in `portal.css`, 9 in `SaSustainFeedback.css`), mostly `rgba()` copies of token colours. Text on accent fills uses `#1a2231` directly. A light theme is impossible without fixing this first.
3. **Two unrelated shells.** Owner/Teacher use a top tab bar; Student uses a sidebar. They look and behave like different products.
4. **No URL routing.** Refresh, Back, bookmarks and shared links all lose the current page.
5. **Mobile headers waste space.** On a 390 px screen the Teacher header wraps to three rows (≈170 px) before any content. The Student top bar wraps "Sign out" onto its own row and shows a lone chevron where the brand was hidden. There is no bottom navigation.
6. **Fonts are declared but never loaded.** `Inter` and `Noto Sans Devanagari` fall back to whatever the device has, so Latin and Devanagari text render differently on every machine. There is no display face.
7. **`<html lang>` is only set by the studio shell.** Owner, Teacher and sign-in screens in Marathi or Hindi still announce `lang="en"`, so screen readers use the wrong voice.

**P2 — quality and clarity**

8. **Owner overview is thin.** Five numbers and empty space; no upcoming sessions, paused batches or other exceptions that the data already supports.
9. **Teacher calendar is tall and low-contrast.** The 06:00–22:00 grid is about 1300 px high at desktop, short batches truncate ("Bhaja…"), and all blocks are the same gold. The "Create batch" button floats below the heading baseline.
10. **Student home ignores academy data.** The next class and open assignments are on separate pages; home only shows studio content.
11. **Headline tracking is tuned for Latin.** `letter-spacing: -.06em` and `line-height: 1.03` on headings squeeze Devanagari conjuncts and clip matras.
12. **Decorative musical motifs.** The orbit with Sa/Re/Ga on the studio hero and landing page is decoration, not data. The brief allows musical visuals only where they are functional.
13. **Focus ring colour** (`#ffe08f`) only works on dark backgrounds.

**P3 — polish**

14. Routine planner and Progress share the same trophy icon in the sidebar.
15. Tables on the Owner pages have no sorting or search; long tables only scroll.
16. Form controls are 40–44 px; a few (portal tabs, day tabs) are 40 px, below the 44 px target.

### 1.4 What we reuse

- All React components, data flows, API contracts and role checks. The redesign changes presentation, not behaviour.
- `useApi` / `LoadState` for loading, error and empty states.
- Native `<dialog>` in `BatchCalendar.jsx` (focus trap and Escape handling for free).
- `schedule.js` (week maths, slot sizing) and the calendar's keyboard-focusable slots.
- `StudentTimetable` day cards as the base for the mobile agenda.
- `prefers-reduced-motion` handling, `sr-only`, focus-to-heading on page change in `PortalShell`.
- The existing token names (`--bg`, `--surface`, `--text`, `--accent`, …) as the semantic layer, so existing CSS keeps working while values change.
- The SSR test harness and the screenshot harness used for this audit.

### 1.5 Regressions to avoid

- Microphone practice, tanpura, routines and results must keep working offline without an account.
- Role isolation: a teacher sees only their own students and answers; only the assignment's teacher opens student answer files.
- Calendar: recurring weekdays, academy timezone label, paused batches shown as paused, overlap warnings.
- Uploads: progress bar, size/type errors, link attachments.
- All three languages; no new untranslated strings.
- Google Meet stays an external link; never claim it is embedded or generated.
- No invented numbers: no fake streaks, scores, trends or AI evaluation.

---

## 2. Design brief and visual direction

> Superseded on 2026-11-16, first by the Darbar theme (section 11) and then by Counterpoint (section 12).

**Concept: "Rehearsal room at dusk."** Warm ivory paper and burgundy ink by day; a deep plum-black room lit by brass by night. Editorial serif headlines give the academy a cultural, printed-programme feel; a quiet sans keeps forms, tables and the calendar easy to scan.

- **Light theme:** ivory canvas, white cards, burgundy for primary actions and headings accents, antique gold as hairlines, rings and highlights only (never body text), muted rose as a secondary accent.
- **Dark theme:** plum-black canvas with raised plum surfaces, ivory text, a lightened burgundy-rose for primary actions, brass gold for emphasis numbers and focus rings.
- **Layout:** bento grids on dashboards (one hero tile, smaller supporting tiles), generous whitespace, asymmetric editorial headers. Glass (translucent blur) only on sticky bars and the mobile bottom navigation.
- **Musical cues:** a thin gold rule, swara names set in Devanagari serif, a tanpura/pitch visual only where real audio or pitch data drives it.
- **Motion:** 120–280 ms fades and lifts for navigation, dialogs and cards; richer motion only while audio is playing or being analysed; everything off under `prefers-reduced-motion`.

---

## 3. Design tokens

Tokens live at the top of `apps/web/src/styles.css`. Light values sit on `:root`; dark values on `:root[data-theme="dark"]`. Existing names are kept as the semantic layer so current components keep working.

Contrast ratios are WCAG 2.x relative-luminance ratios, computed for the pairs that occur in the UI. Targets: 4.5:1 for normal text, 3:1 for large text, icons and control boundaries.

### 3.1 Light theme

| Token | Value | Use | Contrast (pair) |
| --- | --- | --- | --- |
| `--bg` | `#F8F3EA` | Canvas (ivory) | — |
| `--surface` | `#FFFFFF` | Cards, panels, inputs | — |
| `--surface-soft` | `#FBF7F1` | List rows, insets | — |
| `--surface-strong` | `#F1E8DE` | Hover, active tab, secondary button | — |
| `--text` | `#28232B` | Body text | 13.91 on canvas, 12.70 on strong |
| `--text-muted` | `#5E5460` | Secondary text | 6.52 on canvas, 5.95 on strong, 7.21 on white |
| `--text-subtle` | `#6E636C` | Captions, hints | 5.19 on canvas, 4.73 on strong, 5.73 on white |
| `--border` | `#DFD1C4` | Decorative dividers and card edges | 1.49 (decorative only) |
| `--border-strong` | `#8A7A73` | Input and control boundaries | 4.11 on white, 3.72 on canvas, 3.39 on strong |
| `--primary` | `#6A2339` | Primary buttons, selected states | 10.98 with white text |
| `--primary-hover` | `#57192D` | Primary hover | 12.01 with ivory text |
| `--on-primary` | `#FFFFFF` | Text on primary | — |
| `--accent` | `#6A2339` | Eyebrows, links, active marks | 9.94 on canvas |
| `--accent-strong` | `#7A5A1E` | Emphasis numbers (gold ink) | 5.74 on canvas, 6.35 on white |
| `--gold` | `#C6A46A` | Hairlines, rings, ornaments | 2.13 — never for text |
| `--rose` | `#A15B62` | Secondary accent | 5.01 on white |
| `--success` | `#2D6A45` | Success text | 5.83 on canvas, 5.52 on its tint |
| `--warning` | `#8A5300` | Warning text | 5.73 on canvas, 5.37 on its tint |
| `--error` | `#A3302F` | Error text | 6.29 on canvas, 5.69 on its tint |
| `--info` | `#2E5C85` | Info text | 6.36 on canvas, 5.89 on its tint |
| `--focus` | `#6A2339` | Focus ring | 9.94 on canvas |
| `--pitch-flat / sharp / tune` | `#2E5C85` / `#9A4A12` / `#2D6A45` | Pitch feedback | ≥ 5.8 on white |
| `--chart-1…5` | `#6A2339 #B08A45 #2F6B66 #4A5C8C #A15B62` | Data series | ≥ 3.2 on white |

### 3.2 Dark theme

| Token | Value | Use | Contrast (pair) |
| --- | --- | --- | --- |
| `--bg` | `#19151B` | Canvas | — |
| `--surface` | `#262029` | Cards, panels | — |
| `--surface-soft` | `#201A22` | Inputs, list rows | — |
| `--surface-strong` | `#332A33` | Hover, active tab, secondary button | — |
| `--text` | `#F8F3EA` | Body text | 16.32 on canvas, 12.50 on strong |
| `--text-muted` | `#C9BFC5` | Secondary text | 8.89 on surface, 7.73 on strong |
| `--text-subtle` | `#A79BA3` | Captions, hints | 6.75 on canvas, 5.17 on strong |
| `--border` | `#493A45` | Decorative dividers | 1.49 (decorative only) |
| `--border-strong` | `#86737F` | Control boundaries | 3.61 on surface, 3.14 on strong, 4.10 on canvas |
| `--primary` | `#C77E94` | Primary buttons, selected states | 5.87 with canvas-coloured text |
| `--primary-hover` | `#D594A7` | Primary hover | 7.41 |
| `--on-primary` | `#19151B` | Text on primary | — |
| `--accent` | `#E3A1B4` | Eyebrows, links, active marks | 7.59 on surface, 8.61 on canvas |
| `--accent-strong` | `#D7B97E` | Emphasis numbers (brass) | 8.43 on surface |
| `--gold` | `#D7B97E` | Hairlines, rings | 8.43 on surface |
| `--rose` | `#D9A0A6` | Secondary accent | 7.21 on surface |
| `--success / warning / error / info` | `#7FD1A0 #E9B96A #F29A8E #8FB9E6` | Status text | 8.73 / 8.79 / 7.41 / 7.76 on surface |
| `--focus` | `#D7B97E` | Focus ring | 9.56 on canvas, 7.32 on strong |
| `--pitch-flat / sharp / tune` | `#8FB9E6` / `#EFA071` / `#7FD1A0` | Pitch feedback | ≥ 7.5 on surface |
| `--chart-1…5` | `#C77E94 #D7B97E #7CC4B8 #9CAFE0 #E7A9A3` | Data series | ≥ 5.1 on surface |

Status is never shown by colour alone: badges carry a word, paused batches use a hatch pattern plus a "Paused" label, chart series get direct labels.

### 3.3 Derived tokens

- **Tints** use `color-mix(in srgb, <token> N%, transparent)` instead of copied `rgba()` values, so one change updates both themes.
- **Overlay** (`--overlay`): scrims and dialog backdrops. Light `rgb(40 35 43 / .45)`, dark `rgb(8 6 10 / .72)`.
- **Glass** (`--glass`): sticky bars only. `color-mix(in srgb, var(--bg) 82%, transparent)` + `backdrop-filter: blur(18px)`.
- **Shadows:** light uses warm brown shadows at low alpha; dark uses black at higher alpha.

### 3.4 Scale tokens

- **Spacing:** 4-point rhythm, `--space-1` (4 px) to `--space-8` (64 px).
- **Radius:** `--radius-sm` 10 px (controls), `--radius-md` 16 px (cards), `--radius-lg` 24 px (hero tiles, dialogs), `99px` pills.
- **Motion:** `--duration-fast` 120 ms, `--ease` 180 ms, `--duration-slow` 280 ms; `--ease-out` `cubic-bezier(.2, .7, .2, 1)`.
- **Breakpoints:** 560, 700, 850, 1024 px (existing). Phase 2 settles on 600 (phone), 900 (tablet), 1200 (wide desktop).

### 3.5 Theme behaviour

- First visit follows the system setting (`prefers-color-scheme`).
- The theme button switches light/dark and stores the choice in `localStorage` (`nadopasana-theme`).
- With no stored choice, the page follows live system changes.
- Once a theme is chosen it stays until changed; there is no separate "follow system" option yet (clearing site data restores it). Add a three-way choice in Settings if people ask for it.
- An inline script in `index.html` sets `data-theme` before the first paint, so there is no flash of the wrong theme. It also sets `<meta name="theme-color">`.
- `color-scheme` follows the theme, so native controls, scrollbars and date pickers match.

---

## 4. Typography

| Role | Family | Why |
| --- | --- | --- |
| Display (h1, hero, section titles) | **Fraunces** (variable, OFL) | Soft editorial serif with warmth; reads as cultural and premium without being ornamental. |
| UI (body, forms, tables, nav) | **Inter** (variable, OFL) | Neutral, highly legible at small sizes, tabular numbers for times. |
| Devanagari UI | **Noto Sans Devanagari** (variable, OFL) | Matches Inter's weight and x-height; full Marathi and Hindi coverage. |
| Devanagari display, swara names | **Noto Serif Devanagari** (variable, OFL) | Gives Marathi and Hindi headings the same editorial voice as Fraunces. |

- Fonts are self-hosted through `@fontsource-variable/*` packages and bundled by Vite. No request goes to a third-party font CDN.
- Each family is split by `unicode-range`, so the browser downloads only the scripts a page uses.
- Font stacks list the Latin face first and the Devanagari face second. Latin glyphs come from Fraunces/Inter; Devanagari glyphs fall through to Noto. A Latin display face is never forced onto Devanagari.
- Under `:lang(mr)` and `:lang(hi)`, headings drop negative tracking and use a taller line height so conjuncts and matras are not clipped.
- Scale (fluid): display `clamp(2.2rem, 5vw, 4.2rem)`, h1 `clamp(1.9rem, 4vw, 2.9rem)`, h2 `1.15–1.45rem`, body 16 px, small 13–14 px, caption 12 px. Body line height 1.6; headings 1.08 (Latin) / 1.3 (Devanagari).

---

## 5. Sitemap, navigation and core journeys

### 5.1 Sitemap (live since Phase 2)

```
/studio            Guest practice studio (offline or "practise without an account")
  /studio/practice  /studio/library  /studio/routines  /studio/progress  /studio/settings
/student           Student home (Riyaz studio)
  /student/timetable  /student/assignments  + the studio pages above under /student/…
/teacher           Teaching workspace (stats, calendar, roster)
  /teacher/assignments
/owner             Command center
  /owner/users  /owner/courses  /owner/enrollments  /owner/batches
```

- `src/router.js` uses the History API (no dependency). The sign-in page shows at whatever URL was opened. After signing in, that URL opens if the account has the role.
- A path for another role, or an unknown page, is replaced by the role's home.
- Sub-pages share their parent's URL: results under practice, Alankar under library, a running routine under routines. They need in-memory state, so they cannot be opened from a link.
- `server.mjs`, `vite dev` and `vite preview` all serve `index.html` for unknown paths, so a refresh works everywhere.

### 5.2 Navigation map

| Width | Navigation |
| --- | --- |
| ≥ 1024 px | Collapsible left sidebar (icons + labels; collapses to icons). Compact top bar: page title, language, theme, account. |
| 600–1023 px | Sidebar as a drawer opened from the top bar; 44 px targets. |
| < 600 px | Bottom navigation with up to five primary items; secondary items in a "More" sheet. One-row top bar. |

### 5.3 Core journeys

- **Teacher:** open workspace → see today's classes and next session → create or edit a batch from the calendar (tap a slot or "Create batch") → review submitted answers.
- **Owner:** see academy totals and exceptions (paused batches, students without a batch) → open a table → search, filter, edit.
- **Student:** see next class and open assignments → start practice or open an assignment → upload a recording → read teacher feedback.

---

## 6. Component inventory and strategy

Components stay in plain JSX + CSS classes. Primitives are built once and reused instead of one-off CSS per page. No UI library is added.

| Group | Exists today | Plan |
| --- | --- | --- |
| Buttons | `.button`, `.primary`, `.quiet`, `.danger`, `.icon-button` | Add tertiary, loading and disabled styles; tokenise (Phase 1–2). |
| Inputs | `select`, `.portal-input`, `.search-field`, day toggles | One field style for all inputs; error state with message (Phase 2). |
| Dialogs | Native `<dialog>` batch dialog | Shared dialog styles; full-screen sheet under 600 px (Phase 2–3). |
| Cards | `.panel`, `.stat-card`, `.feature-card`, `.hero-panel` | Standard, bento, metric, class, practice variants (Phase 2). |
| Tables | `.data-table` | Sortable headers, search, responsive card list on phones (Phase 4). |
| Calendar | `BatchCalendar` grid, `.cal-block` | Trim hours to the teacher's range, colour by course with labels, agenda on phones (Phase 3). |
| Feedback | `.notice`, `.status-badge`, `LoadState` | Toast for saves, skeletons for loading (Phase 2). |
| Navigation | Sidebar, top tabs, breadcrumbs | One shell with sidebar, drawer and bottom nav (Phase 2). |
| Theme switcher | — | `ThemeToggle` (Phase 1). |
| Audio | Tanpura player, pitch readout, Sa sustain feedback | Keep; visuals only when driven by real audio (Phase 5). |
| Charts | — | Only when real data exists; tokens ready (`--chart-*`). |

---

## 7. Page-by-page plan

| Page | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Sign in | Split: brand panel + form | Centred card | Full-width form, one-row header |
| Owner overview | Bento: totals row, upcoming sessions, exceptions | Two columns | Single column, totals as a 2×N grid |
| Owner tables | Form sheet + full-width table with search | Same | Card list per row, actions as full-width buttons |
| Teacher workspace | Today panel + stat tiles, calendar, roster | Week grid from 700 px | Agenda list by day; full-screen batch sheet |
| Teacher assignments | List + detail | Same, stacked | Stacked cards; answers collapsible |
| Student home | Practice hero, then classes today + work to hand in, then practice cards | Two columns | Single column, practice CTA first |
| Student timetable | Week agenda | Same | Agenda (already) |
| Student assignments | Cards with answer area | Same | Same; upload button full width |
| Studio pages | Keep layouts, restyle with tokens | — | — |

---

## 8. Phased file-level plan

| Phase | Files | Rollback |
| --- | --- | --- |
| 1 | `index.html` (theme boot script), `src/styles.css` (tokens, colour refactor, fonts), `src/portal.css`, `src/SaSustainFeedback.css`, new `src/theme.jsx` (`ThemeToggle`), `src/PortalShell.jsx`, `src/main.jsx`, `src/AccountRoot.jsx` (toggle placement, `lang`), `packages/localization/src/portalUi.js` (theme strings), `apps/web/package.json` (font packages), tests | Revert the PR; no data or API change. |
| 2 | New `src/AppShell.jsx` and `src/router.js`; `main.jsx`, `PortalShell.jsx`, `OwnerPortal.jsx`, `TeacherPortal.jsx`, `AccountRoot.jsx`; CSS for shell, bottom nav, sheets | Revert the PR. |
| 3 | `TeacherPortal.jsx`, `BatchCalendar.jsx`, `schedule.js`, `portal.css` | Revert the PR. |
| 4 | `OwnerPortal.jsx`, `portal.css` (tables, filters) | Revert the PR. |
| 5 | `main.jsx` (student home), `StudentTimetable.jsx`, `Assignments.jsx` | Revert the PR. |
| 6 | Any; accessibility and performance fixes; screenshots | Revert the PR. |

Each phase ships as its own branch and pull request, with tests and before/after screenshots at 360, 390, 768, 1024, 1280 and 1440 px in both themes.

---

## 9. Screenshots

Before the redesign (dark theme only), captured with headless Chrome against a seeded demo academy:

| Screen | File |
| --- | --- |
| Sign in, 390 px | `ui-redesign/before/03-login-390.jpg` |
| Studio home, 1280 px | `ui-redesign/before/04-studio-home-1280.jpg` |
| Owner overview, 1280 px | `ui-redesign/before/06-owner-overview-1280.jpg` |
| Owner accounts, 1280 px | `ui-redesign/before/07-owner-users-1280.jpg` |
| Teacher dashboard, 1440 px (full page) | `ui-redesign/before/08-teacher-dashboard-1440.jpg` |
| Teacher dashboard, 390 px | `ui-redesign/before/09-teacher-dashboard-390.jpg` |
| Teacher assignments, 1280 px | `ui-redesign/before/10-teacher-assignments-1280.jpg` |
| Student timetable, 390 px | `ui-redesign/before/12-student-timetable-390.jpg` |
| Student assignments, 1280 px | `ui-redesign/before/13-student-assignments-1280.jpg` |

After Phase 6 (QA): `ui-redesign/phase6/` holds contact sheets of the full matrix. Each `matrix-<screen>.jpg` shows one screen at 360, 390, 768, 1024, 1280 and 1440 px, light on the top row and dark below: sign in, teacher dashboard, teacher assignments, owner overview, owner accounts, student home and student timetable. `matrix-i18n.jpg` shows Marathi (light) and Hindi (dark) at 360 px for owner accounts, student home and teacher dashboard.

After Phase 5 (student studio): `ui-redesign/phase5/`. These cover the signed-in home at 1440 px light, 1280 px dark, 390 px light and in Marathi at 768 px; the timetable at 390 px dark and 1024 px light; and assignments at 390 px.

After Phase 4 (owner command center): `ui-redesign/phase4/`. These cover the overview at 1440 px light, 1280 px dark and 390 px light; accounts at 1280 px light, at 1280 px dark with a search, at 390 px dark (card rows) and with the create sheet at 1280 px; the course sheet at 390 px; enrollments at 768 px dark; and batches in Marathi at 1024 px.

After Phase 3 (teacher workspace): `ui-redesign/phase3/`. These cover the dashboard at 1440 px light (full page), 1280 px dark, the list view at 1280 px, the batch dialog at 1280 px, 768 px dark, Marathi at 1024 px, 390 px light (full page, agenda) and the full-screen batch sheet at 390 px dark.

After Phase 2 (shared shell, bottom navigation, URL routes): `ui-redesign/phase2/`. These cover teacher at 360, 390 (drawer open), 768, 1024 and 1440 px; owner accounts at 390 and 1280 px; owner batches in Marathi at 390 px; student timetable at 390 px; student home at 1280 px; and the guest library at 390 px, in both themes.

After Phase 1 (layouts unchanged; tokens, fonts and themes applied):

| Screen | File |
| --- | --- |
| Sign in, 390 px, light | `ui-redesign/phase1/light-login-390.jpg` |
| Teacher dashboard, 1440 px, light / dark | `ui-redesign/phase1/light-teacher-1440.jpg`, `ui-redesign/phase1/dark-teacher-1440.jpg` |
| Teacher dashboard in Marathi, 1024 px, light | `ui-redesign/phase1/light-teacher-mr-1024.jpg` |
| Owner accounts, 1280 px, light / dark | `ui-redesign/phase1/light-owner-users-1280.jpg`, `ui-redesign/phase1/dark-owner-users-1280.jpg` |
| Student home, 1280 px, light / dark | `ui-redesign/phase1/light-student-home-1280.jpg`, `ui-redesign/phase1/dark-student-home-1280.jpg` |
| Student assignments, 1280 px, dark | `ui-redesign/phase1/dark-student-assign-1280.jpg` |
| Landing, 1280 px, light | `ui-redesign/phase1/light-landing-1280.jpg` |
| Student timetable, 768 px, light | `ui-redesign/phase1/light-timetable-768.jpg` |

---

## 10. Progress log

- **Counterpoint extras 3:** drag to create on the week calendar (section 12). Checked: `npm test` 165/165, `npm run build` (497.1 kB), real mouse drag, Escape, click and keyboard in Chrome.
- **Counterpoint extras 2:** loading placeholders and view transitions (section 12). Checked: `npm test` 164/164, `npm run build` (495.4 kB), transitions verified in Chrome with motion allowed and skipped under reduced motion.
- **Counterpoint extras 1:** Accounts toolbar (role and status filters), sortable columns with `aria-sort`, and a toast with "View account" after creating an account (section 12). Fixed: the page-in animation held an identity transform, which made `.page` the containing block for fixed elements. Checked: `npm test` 163/163, `npm run build`.
- **Counterpoint step 5:** QA (section 12). 150-shot matrix with no overflow, axe-core 4.10 with WCAG 2.2 AA rules on 38 page states with no violations, reduced motion verified, 200% zoom checked on 11 screens. Fixed: unlabelled routine picker, landing nav links wrapping at 1024–1280 px, three redundant page-title eyebrows. Checked: `npm test` 162/162, `npm run build` (main bundle 493.8 kB).
- **Counterpoint step 4:** owner tables and drawer, sign-in, landing (section 12). Checked: `npm test` 162/162, `npm run build` (main bundle 494.0 kB), owner, sign-in and landing screenshots at 1440, 1280, 1024, 390 and Marathi 360 px, no overflow.
- **Counterpoint step 3:** teacher dashboard and the answer history (section 12). Checked: `npm test` 161/161, `npm run build` (main bundle 496.9 kB), teacher screenshots at 1440, 1280, 768 and 390 px, Marathi at 390 px dark, no overflow.
- **Counterpoint step 2:** practice studio (section 12): held-Sa trace, studio grid with a pinned transport on phones, beat ruler, tanpura in the control column. Checked: `npm test` 160/160, `npm run build` (main bundle 495.3 kB), studio screenshots with a synthetic voice fed into the real pitch pipeline.
- **Counterpoint step 1:** foundation, shell and Student Home (section 12). Darbar layer, crests and raga hour removed. Checked: `npm test`, `npm run build`, 90-shot matrix.
- **Darbar part 2 (raga time of day):** prahar chip in the top bar, raga line on the student hero and sign-in, prahar-driven accent (section 11). Checked: `npm test` 159/159, `npm run build`, screenshots `ui-redesign/darbar/raga-*.jpg`.
- **Darbar part 1 (classical redesign):** palette, bands, jaali/toran motifs, gold-leaf frames, domed tops, Tiro Devanagari titles and Devanagari page crests, all in a new `darbar.css` loaded after the base styles (section 11). Checked: `npm test` 158/158, `npm run build`, 90-shot matrix with no overflow.
- **Phase 6:** QA, accessibility and performance.
  - Matrix: 90 screenshots of seven screens at 360, 390, 768, 1024, 1280 and 1440 px in both themes, plus Marathi and Hindi at 360 px. The harness flags any visible element that ends past the right edge of the viewport and is not inside a scroll container. No screen overflows.
  - Fixed: the sign-in page at 360 px was wider than the screen (the grid column grew to the header's width; the theme button and the card edge were cut). The column is now `minmax(0, 1fr)`, and the header language picker is compact on phones, like the app top bar.
  - Fixed: the "Classes today" list adapts to its panel's width with a container query, not the screen width. At 1024 px the student and owner panels are narrow, and the time, name and "Next" badge now stack instead of squeezing (the badge used to stick out of its card).
  - Performance: the Owner and Teacher portals load on demand (`React.lazy` in `AccountRoot.jsx`), so students and guests do not download them. Main bundle 515 kB to 494.7 kB, below Vite's 500 kB warning. A test keeps both portals out of the static imports.
  - Contrast: the new pairs from Phases 4-5 pass AA in both themes (warning counts 5.93 light / 9.42 dark; small captions on list rows 5.37 / 6.38).
  - Checked: `npm test` 158/158, `npm run build`.
  - Known and accepted: phone card rows set table elements to `display: block`, and some Safari versions then drop table semantics for screen readers (row content and labels are still read in order). A paused batch takes the right half of its calendar column, so its title is shortened in the week grid; the full name is in the tooltip and the agenda. The main bundle has about 5 kB of headroom; the next big addition should be lazy-loaded too.
- **Phase 5:** student studio.
  - Signed-in home: under the practice hero (still the first thing, with "Start practice"), a two-panel strip shows "Classes today" (the shared `TodayPanel`, with each teacher's name and the next class on a later day) and "To hand in": up to three assignments with no answer or only a draft, with course, due date and status, linking to Assignments. The local-first practice cards follow unchanged. The offline studio has no strip.
  - Timetable: the next class is marked "Next" with a burgundy edge.
  - `TodayPanel` moved to `BatchCalendar.jsx` so Owner, Teacher and Student share it. It shows the member count only when the batch carries member ids (students never get other members).
  - Bottom navigation labels wrap to two lines instead of being cut ("Practice studio").
  - Checked: `npm test` 157/157 (new test for open assignments, the student today panel and Home placement), `npm run build`. Screenshots in `ui-redesign/phase5/`.
- **Phase 4:** owner command center.
  - Overview bento: the five totals are links to their pages. "Classes today" across all teachers (with each teacher's name) sits next to "Needs attention". That panel lists only exceptions found in academy records: active courses without a teacher, active students with no active enrollment, active enrollments not placed in any active batch of that course, paused batches and paused enrollments. Each item shows its count and first names and opens the page where it is fixed. With nothing to fix it says so.
  - Accounts, Courses and Enrollments: the create/edit form moved from a side column into a sheet (`Sheet` in `PortalShell.jsx`, native `<dialog>`, full screen on phones), opened from a button next to the page title. Tables get the full width, so the row actions no longer stack at 1280 px. Every owner table has a search box. Under 600 px each row becomes a card with labelled fields and full-width actions.
  - API: `GET /api/owner/batches` now also returns `teacher_id`, `course_id` and `student_ids` (read-only, needed for "Enrollments without a batch" and the today list).
  - Removed the unused two-column form layout CSS. The batch dialog class is now the shared `.sheet-dialog`.
  - Skipped: column sorting. The server already returns each table sorted by name, and search covers finding a row. Add sorting if academies grow past a few hundred rows.
  - Checked: `npm test` 156/156 (new test for the attention rules, sheets and search), API 57/57, `npm run build`. Screenshots in `ui-redesign/phase4/`.
- **Phase 3:** teacher workspace and batch calendar.
  - The dashboard opens with a bento: a "Classes today" panel (academy time zone) next to three stat tiles. The panel marks each class as finished, live or next, and names the next class on a later day when today has none left. The "Answers to review" tile counts submitted answers and opens Assignments.
  - Calendar: blocks are coloured by course (`--chart-*` tokens) with a legend; a "now" line sits on today; the visible hours fit the classes with at least eight hours shown. Week/List toggle on desktop. Under 700 px the grid is replaced by an agenda list by day, with a Today badge and "No classes" on empty days. The old day tabs are gone.
  - The batch dialog becomes a full-screen sheet on phones, with sticky Save/Cancel.
  - Fixed: calendar block titles no longer clip descenders.
  - New helpers in `schedule.js`: `classesOn`, `nextClass`, `nowIn`. `TodayPanel` is exported from `TeacherPortal.jsx` for tests.
  - Checked: `npm test` 155/155 (new test for today and next class; calendar test covers agenda, legend and the now line), `npm run build`. Screenshots in `ui-redesign/phase3/`.
  - Known: a paused batch is drawn in the right half of its column so an active batch at the same time stays visible; its title is shortened in the week grid. The full name is in the block tooltip and the agenda.
- **Phase 0:** audit, token specification with contrast checks, sitemap, component inventory and phased plan written; baseline screenshots captured.
- **Phase 2:** shared shell and navigation.
  - New `src/AppShell.jsx` is used by every role. It has a collapsible sidebar on desktop and a drawer from 850 px down. Under 600 px there is a bottom bar with the first four pages plus "More", which opens the drawer with the rest, the account and sign-out. The compact top bar holds the page title, language and theme.
  - Owner and Teacher lost their separate top-tab header. `PortalShell` is now a thin wrapper around `AppShell`. Nav items have icons; Routine planner and Progress no longer share the trophy icon.
  - URL routes (`src/router.js`): refresh, Back/Forward, bookmarks and deep links keep the page.
  - Accessibility: "Skip to main content" link, a real `<main id="main-content">` (the top bar is no longer inside it), `aria-current="page"` in both navs, and focus moves to the new page heading.
  - The account block (name, portal switcher, sign out) moved to the foot of the sidebar, so the top bar fits on one row at every width from 360 px.
  - Checked: `npm test` 154/154 (3 new in `test/shell.test.js`, navigation harness updated for the shell), `npm run build`. In headless Chrome: a deep link to `/teacher/assignments` opens Assignments; `/owner/users` as a teacher becomes `/teacher`; Back after two clicks returns to the previous page.
  - Known: on Owner tables at 1280 px, the action buttons stack because the sidebar takes width. Phase 4 replaces those tables.
- **Phase 1:** design system foundation.
  - Light and dark tokens from section 3 are in `styles.css`. All 145 hard-coded colours in `styles.css`, `portal.css` and `SaSustainFeedback.css` are replaced by tokens or `color-mix()` tints, and a test keeps it that way.
  - `index.html` picks the theme before the first paint. `src/theme.jsx` adds `ThemeToggle` to the sign-in page, the portal header, the studio top bar and the landing page, and follows live system changes until the person chooses.
  - Fraunces, Inter, Noto Sans Devanagari and Noto Serif Devanagari are self-hosted. Headings, brand and stat numbers use the display face. Devanagari headings drop negative tracking.
  - Primary actions are burgundy. Calendar blocks are tinted with a burgundy edge; today, selected slots and pressed day toggles use the primary colour. Course chips are gold. Decorative orbits use gold and rose instead of violet and teal.
  - `<html lang>` now follows the chosen language on the sign-in, Owner and Teacher screens.
  - Checked: `npm test` 151/151 (4 new theme tests), API 57/57, `npm run build`, web Docker image build. In headless Chrome: system light, toggle to dark, reload, still dark, with matching `theme-color`.
  - Known and left for later phases: the Teacher/Owner header still wraps to three rows on phones (Phase 2). Calendar block titles clip descenders at small sizes (Phase 3). The JS bundle is just over Vite's 500 kB warning (code splitting in Phase 6).

---

## 11. Darbar theme (classical redesign)

> Superseded on 2026-11-16 by Counterpoint (section 12). Review: over-decorated, looked AI-generated, no smoothness. Removed: palette, jaali/toran motifs, gold frames, domed cards, Devanagari crests, raga-hour chip and accent.

After Phases 0-6 the review was: the UI does not feel classical. Decisions on 2026-11-16: the **Darbar / haveli** direction, **bold on every screen** (including Owner tables), with **Devanagari headings**, **motif patterns** and **raga time of day**.

**Concept: "Haveli by day, darbar by night."** Sandstone and cream with indigo ink by day; an indigo night by dark. Saffron for actions, gold leaf for frames and rules, sindoor red for eyebrows and table headings.

| Token | Light | Dark | Contrast |
| --- | --- | --- | --- |
| `--bg` / `--surface` | `#F3EAD8` / `#FFFAF0` | `#11132A` / `#1B1E3D` | — |
| `--text` | `#1D1B3A` (indigo ink) | `#F6EEDC` | 13.83 / 15.80 on canvas |
| `--text-muted` / `--text-subtle` | `#4A4566` / `#5F5876` | `#CFC6B4` / `#ACA28F` | ≥ 5.06 on every surface |
| `--primary` + `--on-primary` | `#E08A2C` saffron + `#1D1B3A` | `#F0A24A` + `#11132A` | 6.17 / 8.67 |
| `--accent` (eyebrows, table heads) | `#A3311D` sindoor | `#F3A07F` | 5.83 / 8.82 on canvas |
| `--accent-strong` (numbers) | `#8A5A10` | `#E2C27A` | 4.95 / 9.41 |
| `--gold` (frames, rules, motifs) | `#C9A24E` | `#D9B45E` | decorative only |
| `--border-strong` (controls) | `#8A7650` | `#8A86A8` | 3.67 / 3.94 |
| `--band-*` (sidebar, heroes, phone bar) | indigo `#1C2559`, text `#F8F0DC`, muted `#D3CAB4`, accent `#F2B36B` | `#0B0D20`, same text | ≥ 7.6 |

- **Bands:** the sidebar, the phone bottom bar and every hero sit on the indigo night in both themes. `darbar.css` remaps the colour tokens inside them, so every component works there unchanged.
- **Motifs** are SVG masks painted with tokens: a jaali lattice (interlocking circles) behind the page, sidebar and heroes; a gold toran (scallops with drops) hanging under the top bar and across hero tops; gold-leaf rules with ✦ in the page crest.
- **Frames:** panels, stat tiles and sheets get an inner gold-leaf border like a miniature painting. The hero, the sign-in card, today panels and sheets have a domed (arched) top like a haveli doorway.
- **Type:** Tiro Devanagari Marathi (one classical face for Latin and Devanagari) for titles, brand, table headings and stat numbers, at regular weight. Inter / Noto Sans Devanagari stay for UI text. Fraunces and Noto Serif Devanagari were removed.
- **Devanagari headings:** every page has a crest with its classical name (`src/darbar.jsx`): दरबार (overview), सदस्य, पाठ्यक्रम, प्रवेश, वर्ग, गुरु कक्ष (teacher), रियाज़ कार्य, समय सारिणी, स्वागतम् (home and sign in), रियाज़, अभ्यास संग्रह, साधना क्रम, प्रगति, व्यवस्था. In English, nav items show the Devanagari name under the label and the brand shows नादोपासना.
- **Raga time of day** (`src/raga.js`): the day is split into the eight three-hour prahars (निशीथ 0-3, उषःकाल 3-6, प्रातःकाल 6-9, पूर्वाह्न 9-12, मध्याह्न 12-15, अपराह्न 15-18, सायंकाल 18-21, प्रदोष 21-24, local time). The top bar shows the current prahar as a chip (desktop); the student hero and the sign-in card show a line with the prahar, the time of day and three ragas traditionally sung then (e.g. dusk: Yaman, Puriya Dhanashri, Marwa). `<html data-prahar>` drives a decorative `--raga` accent (one `--prahar-*` token per prahar) used for the dot, the crest stars and the hero glow. It refreshes every minute. Text colour never depends on it. Strings in en/mr/hi.
- Screenshots: `ui-redesign/darbar/` (key screens, plus `matrix-*.jpg` contact sheets of seven screens at six widths in both themes and Marathi/Hindi at 360 px).

---

## 12. Counterpoint (simple UI, rich UX)

Review of Darbar: "simple UI but rich UX", new palette, smoother, nothing that looks generated. The design spec the user brought (`docs/NadoPasana_Counterpoint_Design_Spec.md` and `docs/NadoPasana_Counterpoint_Tokens.css`, user files, not committed) chose **Counterpoint: a quiet digital instrument**. Identity comes from time, pitch and teacher feedback, not ornament.

**Rollout** (the spec asks for a quality gate after the foundation and one student screen):

| Step | Scope | Status |
| --- | --- | --- |
| 1 | Foundation (tokens, fonts, controls, motion), shell, Student Home | Done |
| 2 | Practice studio: held Sa line, honest mic states, tala ruler | Done |
| 3 | Teacher dashboard: calendar first, metric strip, assignment feedback loop | Done |
| 4 | Owner tables and drawers, sign-in, landing | Done |
| 5 | QA matrix, axe, reduced motion, 200% zoom | Done |

**Palette** (all values and contrast matrices: spec section 2). Mineral `#F4F6F5` canvas, fog `#EDF1F0` surface, white raised surface, ink `#14282D` text, deep tide `#155D67` actions. Dark: night `#101C21`, `#F2F6F4` text, `#96DDE3` actions. Citron `#D8EE84` (`--live`, with `--on-live` text) is a fill used only for the rare live moment, today the "Next class" badge. Every text token is at least 4.5:1 on all three surfaces in both themes.

**Type**: Instrument Sans (Latin) with Anek Devanagari (Marathi, Hindi) in one stack, so mixed course names fall back per glyph. Headings 600, no serif, tabular digits for times. Devanagari pages get line height 1.7 and no negative tracking.

**Shape and space**: 4 px spacing scale. Radii 4 (chips), 8 (controls, buttons), 12 (panels), 16 (dialogs); no pill buttons. Borders before shadows; shadows only on drawers and dialogs. A card is used only for a self-contained object (the next step, one class, one assignment); sections are plain headings on the canvas.

**Motion**: tokens `--motion-fast` 90 ms (press), `--motion-ui` 160 ms (hover, nav), `--motion-surface` 240 ms (sheets, drawer), `--motion-page` 320 ms (page change), easing `cubic-bezier(.2,0,0,1)` / `(.22,1,.36,1)`. Page content fades up 6 px inside a fixed shell; buttons press to 0.985; the active nav bar grows in; sheets rise 8 px; the next-step card draws a tide line on hover or focus. `prefers-reduced-motion` turns all of it off.

**Brand mark**: a voice moving over a held reference line (the studio's Sa line), drawn as an inline SVG in `AppShell.jsx` (`BrandMark`). The wordmark is "**Nado**Pasana" by weight, not colour.

**Student Home** (spec 7A): "Today" with the date; the next-step card (recommended exercise, real reason, Start and Alankar); classes today; work to hand in; the saved routine; the last real session. The hero, the level/XP tiles and the decorative orbit are gone from Home (Progress keeps the participation numbers). Phones stack in that order; desktop uses two columns.

**Practice studio** (spec 7B, the "Held Sa" moment):
- Layout: a narrow control column (tonic, settings lock note, tanpura, instructions; for alankars also BPM, loops, direction and the beat sound) beside the stage. The transport (Start, Pause, Finish, Cancel) sits under the controls on desktop and is pinned above the bottom bar on phones, so it never scrolls away mid-take.
- The stage holds the session status, the elapsed time, the trace and the pitch readout. The trace (`PitchTrace` in `PracticeStudio.jsx`) is a steady reference line for the current target with a ±50 cent band (the same tolerance `livePitch` uses for "In tune"). The voice is drawn as its deviation in cents over the last six seconds, from real `livePitch` readings only. Silence, unvoiced, clipped, stale or low-confidence frames leave a gap; a jump of more than 35 cents between two readings lifts the pen instead of drawing a spike; a reading more than a semitone away shows as a hollow marker at the edge. Idle, waiting, denied or paused: the line is dashed and nothing moves.
- Alankar: a beat ruler of the four beats in the bar under the live metrics, sam drawn heavier, the current beat filled in tide (count-in beats in grey). The swara groups and the existing beat, swara and progress text are unchanged.
- The tanpura has a compact form for the control column (`TanpuraPlayer compact`); its full panel is unchanged elsewhere.
- Screenshots: `ui-redesign/counterpoint/studio-*.jpg`.

**Teacher dashboard** (spec 7C): the title and "Create batch", then one summary row: a metric strip (students, active batches, answers to review, with rules between them instead of three cards; the review count links to Assignments) and the class running now or next as one inline button that opens it. The week calendar follows at full width and starts above the fold at 1280 × 800. The separate "Classes today" panel is gone from this page (today is the highlighted calendar column and the summary row). Phones under 600 px open the calendar on the agenda list. "My students" is a plain section with ruled rows, not a card per student.

**Answer history** (spec signature moment 03, the guru-shishya loop, `AnswerTrail` in `Assignments.jsx`): each sent answer shows its steps from stored data only: Submitted (with `submitted_at`), then Waiting for review or Reviewed (with `reviewed_at`), then "Practise and send again" as a dashed next step once reviewed. A resubmission after review reads Reviewed → Sent again → Waiting for review. Drafts show nothing. Dates are the stored ones; there are no timestamp annotations because the app has none. It appears on the student's assignment card and on each answer in the teacher's review list, where answers are now ruled rows instead of cards inside a card.
- Screenshots: `ui-redesign/counterpoint/teacher-*.jpg`, `assign-*.jpg`.

**Owner** (spec 7D): the overview's five stat cards became the same metric strip as the teacher's (each number links to its page); today's classes and "Needs attention" stay as the two self-contained panels. Accounts, Courses, Enrollments and Batches tables sit on the canvas with ruled rows, not inside a panel. Create and edit open as a 460 px drawer from the right on tablets and up (sliding in 24 px, actions pinned to the bottom); phones keep the full-height sheet. The teacher's batch dialog uses the same drawer. On phones each row is a ruled list entry instead of a card. "Deactivate" is a danger-coloured text button and asks for confirmation naming the person (new string in en/mr/hi); "Reactivate" stays quiet.

**Sign-in** (spec 7E): a password visibility toggle with an accessible label and `aria-pressed`, and a "Caps Lock is on" hint read from the key event. Desktop centres the 460 px form a little lower; no card, no hero.

**Landing**: the decorative orbit, sound-wave bars, the fake practice preview, the empty progress bars, the icon-chip feature cards and every eyebrow are gone. What remains: the headline, one line, Start and Explore, the privacy line, then the held Sa reference line drawn once (static, `aria-hidden`, off under reduced motion). Features are a ruled three-column list; "How it works" is a five-beat time ruler with the first beat heavier (vertical on phones); privacy is a plain list. Phones hide the nav Start button (the hero has one) so the bar fits at 360 px.
- Screenshots: `ui-redesign/counterpoint/owner-*.jpg`, `login-*.jpg`, `landing-*.jpg`.

**QA** (spec section 10):
- Matrix: 150 screenshots. The earlier seven screens (sign-in, student home, timetable, teacher dashboard, teacher assignments, owner overview, accounts) plus practice studio, student assignments, owner batches and the landing page, each at 360, 390, 768, 1024, 1280 and 1440 px in both themes, plus Marathi and Hindi at 390 px. The harness flags any visible element that ends past the right edge and is not inside a scroll container; the landing page is checked with its horizontal clip removed. No screen overflows. Contact sheets: `ui-redesign/counterpoint/matrix-*.jpg`.
- Accessibility: axe-core 4.10 (run from a scratch folder, not a project dependency) with the WCAG 2.0 A/AA, 2.1 AA and 2.2 AA rules, at 1280 px in both themes, on 19 screens: landing, sign-in, home, practice, library, alankar practice, timetable, student assignments, routines, progress, settings, teacher dashboard, teacher assignments with answers open, owner overview, accounts, the account drawer, courses, enrollments and batches. No violations. Fixed on the way: the routine picker had no accessible name (now labelled by the page heading).
- Reduced motion: with `prefers-reduced-motion: reduce` the held-Sa line's animation and the button transitions compute to 1e-06 s (the global rule in `styles.css`). Every screenshot is taken in reduced motion, so layouts never depend on an animation finishing.
- 200% zoom: 1280 × 800 at 200% is a 640 × 400 CSS viewport. Sign-in, home, practice, timetable, student assignments, teacher dashboard, teacher assignments, owner overview, accounts, batches and landing were captured there: no overflow, nothing clipped (`matrix-zoom-200.jpg`).
- Bundle: main chunk 493.8 kB (limit 500 kB); the Owner and Teacher portals stay lazy-loaded.
- Avoid list (spec section 9): no ornament, gradients only as the hatch on paused batches, no pill buttons, no card per metric (metric strips on teacher and owner), no fake audio visuals (the trace draws only real readings; the landing page has none). Remaining eyebrows are contextual (the date on "Classes today", "Session completed" on results, the coach source), not a label above every title; three that repeated the page title were removed. Fixed: the landing nav's three section links wrapped onto two or three lines at 1024–1280 px; they now show only from 1360 px.

**After the five steps** (building what the spec asked for and the first pass left out):
- **Accounts** (spec 7D): a toolbar with search, a role filter and a status filter. Name, Roles and Status sort by clicking the heading (arrow icon, `aria-sort` on the column). Creating an account closes the drawer and shows a toast, "Account created", with "View account" (opens that account in the drawer) and a dismiss button. The toast sits in an always-present polite live region and stays until dismissed (no timer). Filtering and sorting live in `accountRows()` with a test. On phones the two row actions stay as buttons; an actions menu was not added for two items.
- **Loading** (spec 7, states): `LoadState` and the owner "Needs attention" panel show placeholder rows (a slow opacity pulse, still under reduced motion) with the loading text kept for screen readers, instead of a "Loading…" line.
- **Page changes** (spec 5, motion): route changes in every role go through `withTransition()` (`router.js`), which uses `document.startViewTransition` with `flushSync`. Only `main` has a `view-transition-name`, so the sidebar, top bar and bottom bar stay live while the content fades out (160 ms) and the new page rises in (320 ms). Without the API, or under reduced motion, the change is instant; the old CSS entry animation now runs only in browsers without view transitions, so pages never animate twice. Back/Forward stays instant.
- **Drag to create** (spec 7C micro-interactions): in the week grid, press on a slot and drag down the same day; a dashed guide snaps to 30-minute slots and shows the range ("8:00 AM – 9:30 AM"). Releasing opens the batch drawer with that day, start and end; the chosen slots stay highlighted behind it. Escape or a cancelled pointer drops the guide. A plain click or Enter/Space on a slot still opens a one-hour batch, and arrow keys still move between slots. The calendar note says so ("Click a slot, or drag down across slots…"; hidden on touch screens, where dragging scrolls). Not built: dragging an existing batch to move it, and optimistic saves (the list reloads from the server after each save, so there is nothing to roll back).
