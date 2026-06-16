# TryIt — Component Inventory

> **Owner:** CDO / Head of Design. Every component the shopper widget needs, with **every state it can reach** (default · hover · focus · active · loading · empty · error · disabled · success), derived from the real data contracts in `packages/contracts`. A component with only a happy path is a defect (`design-brief.md` §1).
> **Accessibility:** WCAG 2.2 AA is non-negotiable per component — visible focus (`--ti-elev-focus`), full keyboard operability, ≥4.5:1 text contrast, `prefers-reduced-motion` honored, and state changes announced to assistive tech. Notes are inline per component.
> **States legend:** D=default · H=hover · F=focus(keyboard) · A=active/pressed · L=loading · E=empty · X=error · ✗=disabled · ✓=success.

---

## 0. Shared interaction rules (apply to all)
- **Focus** is never removed; it uses the offset `--ti-elev-focus` ring (`--ti-accent`) and must be visible on every theme.
- **Touch targets** ≥ 44×44px (mobile), ≥ 24×24px minimum effective (WCAG 2.2 Target Size AA).
- **Keyboard:** Tab order follows visual order; Esc closes the sheet; Enter/Space activate; arrow keys drive sliders and chip groups.
- **Reduced motion:** all entrance/shimmer motion degrades to opacity-only or instant.
- **Disabled** controls are `aria-disabled` (not removed from the tab order where context is needed), with `--ti-text-disabled` and no shadow.
- **Live regions:** job-status transitions (`processing → succeeded|failed`) fire `aria-live="polite"` (or `assertive` for errors) announcements — the screen-reader user is never left in silence while async work runs.

---

## 1. Launcher Button (`ti-launcher`)
The entry point injected onto the retailer's product page. Discoverability is a known failure mode (Sephora lesson) — it must be obvious without being obnoxious.

- **D:** pill (`--ti-radius-full`), `--ti-elev-2`, accent or neutral-with-accent-icon, label "Try it on". Two variants: floating (corner) or inline (beside add-to-cart).
- **H:** `--ti-accent-hover`, lift to `--ti-elev-2→3`, `--ti-dur-fast`.
- **F:** focus ring; reachable by keyboard from host page tab order.
- **A:** `--ti-accent-active`, scale 0.98, `--ti-dur-instant`.
- **L:** if widget bundle still lazy-loading on click → inline spinner replaces label, control stays in place (no layout shift).
- **✗:** when host config invalid / kill-switch pre-flagged → control hidden entirely (fail-closed) rather than shown-broken.
- **A11y:** `<button>`, `aria-haspopup="dialog"`, accessible name "Try it on with a photo". Not color-only — has icon + text.

---

## 2. Widget Shell / Sheet (`ti-sheet`)
The modal (desktop) / bottom-sheet (mobile) container that hosts all screens.

- **D:** `--ti-surface`, `--ti-radius-xl`, `--ti-elev-3`, scrim `--ti-overlay` behind. Header with title + close; body; sticky footer for the primary action.
- **Open/close:** slide-up (mobile) / fade-scale-in (desktop) `--ti-dur-slow` `--ti-ease-out`; reduced-motion = instant.
- **L:** initial skeleton while product context loads.
- **X:** if the whole session fails to init (e.g. `UNAUTHORIZED`) → a single calm full-shell error state with a "Close" affordance.
- **A11y:** `role="dialog"` `aria-modal="true"`, **focus trapped** inside, focus returns to launcher on close, **Esc closes**, labelled by the screen title. Scrim click closes (with confirm if a photo is mid-flow — don't lose work silently).

---

## 3. Consent Gate (`ti-consent`)  ← first-class screen, not a checkbox
The privacy moment. Equal-weight accept/decline, plain-language *what/why/how-long*, just-in-time. (`design-brief.md` §3.1.)

- **D:** title ("Before you upload a photo"); 3 plain-language points — *what* (one selfie), *why* (to create your preview), *how long* ("used only for this preview, then deleted — never used to train AI, never shared"); a link to the full policy; two **equal-visual-weight** buttons: primary "I agree — continue", secondary "Not now". Optional remember-this-session toggle (off by default; no pre-tick).
- **H/F/A:** standard button states; both buttons reachable and equally prominent (no dark-pattern de-emphasis of decline).
- **E:** n/a (always populated).
- **X:** if consent record fails to persist → proceed only in-memory for this session, surface nothing alarming; never silently assume consent.
- **✓:** on agree → advance to Upload; consent timestamp captured for the audit log (`audit.ts`).
- **A11y:** real radios/checkbox semantics for any toggle; the decline path is keyboard-equal; copy at `--ti-text-body` (not buried caption). No motion required to read it.

---

## 4. Upload Dropzone (`ti-dropzone`)
Accepts the selfie. Enforces client-side the `images.ts` constraints (jpeg/png/webp, ≤8MB) **before** any upload — instruct-before-capture.

- **D (empty/E):** large dashed `--ti-border-strong` zone on `--ti-surface-sunken`, `--ti-radius-lg`; icon + "Drag a photo here, or **choose a file**"; a "Use camera" affordance on mobile; **framing guidance** beneath: "A clear, full-length photo with good light and a plain background works best. Avoid other people. Fitted clothing fits best." (Reframes selfie as a *fitting* — brief §3.2.)
- **H:** border → `--ti-accent`, `--ti-elev-2`, subtle wash `--ti-accent-subtle`.
- **F:** focus ring on the zone; the "choose a file" is a real focusable control.
- **A (drag-over):** stronger accent border + "Drop to upload" label; `--ti-dur-fast`.
- **L:** after a valid file → thumbnail preview with a determinate-where-possible read/validate bar; "Change photo" + "Remove" controls.
- **X — wrong format** (`INVALID_INPUT`): "That file type isn't supported — please use a JPG, PNG, or WebP." Zone reverts, file rejected client-side.
- **X — too large** (`PAYLOAD_TOO_LARGE`): "That photo's a bit large (max 8MB) — try a smaller one or retake it." Offer client-side downscale where feasible.
- **X — no/low subject** (provider/validation hint): "We couldn't find a clear, full-length subject — let's try another photo." Non-blaming, with retry.
- **✗:** disabled during consent-not-yet-given or during active processing.
- **✓:** valid photo staged → primary action ("Try it on") enables.
- **A11y:** native `<input type="file">` is the real control (keyboard + screen-reader operable); drag-drop is an enhancement, never the only path. Errors tied via `aria-describedby`; rejection announced `assertive`. Preview image has alt "Your uploaded photo".

---

## 5. Product Context Strip (`ti-product`)
Shows what's being tried on (from `productId` → catalog connector). Reduces "is this the right item?" anxiety before commit (ASOS pattern).

- **D:** product thumbnail, name, optional price; compact, top of sheet.
- **L:** skeleton matching the strip layout while catalog data loads.
- **X:** if product image fails → neutral placeholder + name only (degrade, don't block).
- **A11y:** image alt = product name; decorative-only chrome marked `aria-hidden`.

---

## 6. Variant Picker (`ti-variants`)  ← only when `numSamples` > 1
The request allows `numSamples` 1–4; the result viewer must handle multiple generated variants.

- **D:** row of up to 4 thumbnails; one selected (accent ring `--ti-accent-subtle`).
- **H/F/A:** standard; arrow-key navigable as a single composite (`role="radiogroup"`).
- **L:** thumbnails fill in as variants arrive (each its own skeleton).
- **E:** hidden entirely when `numSamples === 1`.
- **X:** a variant that fails shows a small retry chip in its slot; others remain usable.
- **A11y:** `role="radiogroup"`, each `role="radio"`, labelled "Result option 1 of N". Selection announced.

---

## 7. Processing / Progress (`ti-processing`)  ← the async wait, designed honestly
Mirrors the job lifecycle `queued → processing`. **Respect the wait** (brief §3.4): layout-mirroring skeleton + honest time expectation + reassurance. Never a naked spinner; never a fake progress bar.

- **D / queued:** skeleton in the exact shape of the coming result frame; copy "Getting in line…"; reassurance "Your photo is being used only for this preview."
- **L / processing:** shimmer over the result-shaped skeleton; honest expectation "This usually takes about 10–20 seconds"; an indeterminate progress indicator (no fake %); optional staged microcopy ("Fitting the item…") that's truthful, not invented.
- **Cached fast-path:** if `cached === true`, skip straight to reveal (no fake wait) — honesty over theatre.
- **X / failed** (`PROVIDER_ERROR`): transitions to the Error+Retry component below.
- **✓ / succeeded:** crossfade into Result Viewer (`--ti-dur-reveal`).
- **Timeout/slow:** after a threshold, reassuring "Still working — almost there"; never spin forever silently.
- **A11y:** `aria-live="polite"` announces "Creating your preview" → "Your preview is ready"; the skeleton is `aria-hidden` with a text status for SR users; **reduced motion** stops the shimmer (static skeleton) but keeps the text status.

---

## 8. Result Viewer + Compare (`ti-result`)  ← the payoff
Renders `resultImageUrl` (HTTPS, signed). The before/after compare is the emotional climax (Sephora split-screen pattern).

- **D:** headline "Here's your fit"; the result image in a `--ti-radius-lg` frame; an **honest AI disclaimer** caption ("AI preview — fit and details may not be exact"); primary action "Add to cart"; secondary "Try another photo" / "Try another item".
- **Compare:** a draggable **before/after slider** between the original selfie and the result (`ti-compare` sub-component) — handle, 1:1 tracking, keyboard arrows move the divider.
- **Zoom:** pinch / click-to-zoom on the result; pannable.
- **H/F/A:** slider handle grows on grab; buttons standard.
- **L:** result image lazy-loads with a blur-up over the skeleton (no layout shift).
- **E:** n/a (only reached on success).
- **X — image fails to load:** "We couldn't load your preview — let's try again" + retry (re-fetch signed URL).
- **✓ — add-to-cart:** primary morphs to a success tick ("Added") `--ti-success`, then offers "View cart" (real host-cart action — nothing static).
- **A11y:** result image alt "Preview of you wearing {product name}"; slider is `role="slider"` with `aria-valuenow`/min/max and arrow-key control; disclaimer is real readable text, not a tooltip; zoom reachable by keyboard.

---

## 9. Error + Retry (`ti-error`)  ← one component, parameterized by `errors.ts` code
A single, calm error surface that adapts copy and recovery affordance to the seven contract error codes. Non-blaming, system-blaming where true (brief §6).

| Code | Tone token | Message (humane) | Recovery |
| --- | --- | --- | --- |
| `INVALID_INPUT` | `--ti-danger` | "Something about that photo didn't work — let's try another." | Retry (re-upload) |
| `PAYLOAD_TOO_LARGE` | `--ti-danger` | "That photo's a bit large (max 8MB) — try a smaller one." | Retry (re-upload, offer downscale) |
| `RATE_LIMITED` | `--ti-warning` | "We're popular right now — try again in a few seconds." | Wait + auto-enabled retry after backoff |
| `BUDGET_EXCEEDED` | `--ti-warning` | "Try-on is taking a quick break here — please check back later." | Graceful dead-end, "Close" |
| `KILL_SWITCH_ENGAGED` | `--ti-warning` | "Try-on is temporarily unavailable — please try again soon." | "Close" |
| `PROVIDER_ERROR` | `--ti-warning` | "We hit a snag creating your preview — let's try again." | Retry (idempotency-key reuse) |
| `UNAUTHORIZED` | `--ti-danger` | "Try-on isn't set up correctly on this store." (retailer-facing) | "Close"; logged for the retailer |

- **States:** D (message + recovery) · F/H/A on the recovery button · L (during auto-retry backoff: countdown) · ✓ (recovery succeeds → returns to the right prior screen, preserving the staged photo where safe).
- **A11y:** announced `assertive`; the recovery action is the first focused element; never relies on color alone (icon + text + tone). Original photo is **not** lost on a retryable error.

---

## 10. Primary / Secondary Buttons (`ti-button`)
- **Primary (D):** `--ti-accent`, `--ti-on-accent`, `--ti-radius-md`, weight 600, `--ti-elev-1`.
  - **H:** `--ti-accent-hover`; **F:** focus ring; **A:** `--ti-accent-active` + scale 0.98 `--ti-dur-instant`; **L:** inline spinner + label "Working…", width preserved (no shift); **✗:** `--ti-text-disabled` on muted surface, no shadow, `aria-disabled`; **✓:** success-tick morph where it confirms an action.
- **Secondary:** `--ti-surface` with `--ti-border`, `--ti-text`; same state grammar.
- **Destructive (remove photo):** `--ti-danger` text/border; confirm before discarding a staged photo.
- **A11y:** real `<button>`; loading state sets `aria-busy`; disabled reason available to SR where useful.

---

## 11. Toast / Inline Status (`ti-toast`)
Transient, non-blocking confirmations (e.g. "Photo removed", "Added to cart").

- **D:** small surface at `--ti-z-toast`, auto-dismiss ~4s, pause-on-hover/focus.
- **States:** success / warning / danger variants; manual dismiss.
- **A11y:** `role="status"` (polite); never the *only* signal for a critical state; dismissible by keyboard.

---

## 12. Close / Withdraw-consent control (`ti-close`)
- **D:** icon button, top-right; clear 44px target.
- **Mid-flow guard:** if a photo is staged/processing, closing asks "Discard your photo?" (don't lose work silently) and, on confirm, **purges the staged photo** (process-then-purge posture).
- **A11y:** accessible name "Close try-on"; Esc-equivalent; focus returns to launcher.

---

## State-coverage matrix (DoD checklist)

| Component | D | H | F | A | L | E | X | ✗ | ✓ |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Launcher | ● | ● | ● | ● | ● | – | – | ● | – |
| Sheet | ● | – | ● | – | ● | – | ● | – | – |
| Consent | ● | ● | ● | ● | – | – | ● | – | ● |
| Dropzone | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Product strip | ● | – | – | – | ● | – | ● | – | – |
| Variant picker | ● | ● | ● | ● | ● | ● | ● | – | ● |
| Processing | ● | – | – | – | ● | – | ● | – | ● |
| Result + compare | ● | ● | ● | ● | ● | – | ● | – | ● |
| Error + retry | ● | ● | ● | ● | ● | – | ● | – | ● |
| Buttons | ● | ● | ● | ● | ● | – | – | ● | ● |
| Toast | ● | ● | ● | – | – | – | ● | – | ● |
| Close | ● | ● | ● | ● | – | – | – | – | – |

(● = state designed; – = not applicable.) Every ● must exist in code and be exercised by the live Playwright suite before the UI is "done" (`design-brief.md` §7).
