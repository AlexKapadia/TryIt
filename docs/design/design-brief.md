# TryIt — Design Brief

> **Owner:** CDO / Head of Design (per `claude.md` §2, §3.14).
> **Status:** Gate 1 — Contracts / Design. This brief is the durable contract that UI-build agents work against — not chat. Re-run the competitive research **per project**; nothing here is a frozen checklist.
> **Scope:** The shopper-facing **embeddable widget** (the only end-user surface). Admin / retailer dashboards are out of scope for this brief.
> **Companions:** [`design-tokens.md`](./design-tokens.md) · [`component-inventory.md`](./component-inventory.md) · [`flows.md`](./flows.md)

---

## 0. The product in one line

A shopper, mid-purchase on a retailer's store, taps a launcher, **uploads a selfie**, gives **explicit consent**, watches an **AI try-on render asynchronously**, then **compares before/after** and **adds the item to cart** — all inside a small embedded surface that loads on someone else's site and is trusted with someone's **face**.

That last clause is the whole job. We are a guest on the retailer's page **and** we are handling the single most sensitive thing a person can upload: a photo of their own body. The bar is: feel as calm, fast, and trustworthy as the best privacy-grade native experiences, while looking like it belongs to a billion-dollar company — never a template, never vibe-coded.

---

## 1. Who we are designing around (real data, every state — back-end first)

This brief was written **after** reading the typed data contracts in `packages/contracts`, so the UI is designed around **real data and every state**, never happy-path mockups (§3.14, §4.9 step 1).

The widget is a thin client over an **async job state machine**. The contracts dictate the states we must design:

- **Job lifecycle** (`jobs.ts`): `queued → processing → succeeded | failed`. Generation is **not** instant — there is a real wait state to design, and a real terminal-failure state.
- **The request** (`tryon.ts`): `tenantId`, `shopperId`, `productId`, a **person image** (the selfie), `category: 'apparel'`, optional `params` (`seed`, `numSamples` 1–4). `numSamples` means the result viewer must handle **1 to 4 generated variants**.
- **The result** (`tryon.ts`): `resultImageUrl` (HTTPS-only, signed/expiring), `provider`, `latencyMs`, `cached`, `costUsd`. We surface realism/trust cues from this — never the raw cost.
- **Image constraints** (`images.ts`): MIME must be **jpeg / png / webp**; decoded size **≤ 8 MB**. These are hard client-side validation gates with their own UI states (wrong format, too large).
- **Error taxonomy** (`errors.ts`): every failure the widget can show maps to one of seven codes — `INVALID_INPUT`, `PAYLOAD_TOO_LARGE`, `UNAUTHORIZED`, `RATE_LIMITED`, `BUDGET_EXCEEDED`, `KILL_SWITCH_ENGAGED`, `PROVIDER_ERROR`. **Each gets a distinct, human, non-blaming message and the right recovery affordance** (retry vs. wait vs. dead-end). See `flows.md` §Failure matrix.

**Design rule:** every component in `component-inventory.md` is specified across default / hover / focus / active / loading / empty / error / disabled / success, because the data tells us all of those states are reachable. A component with only a happy path is a defect.

---

## 2. The vision & the feeling

TryIt should feel like three things at once, in this priority order:

1. **Trustworthy with a sensitive photo.** The dominant emotion. The shopper must feel *in control* — they understand what happens to their selfie, they opted in deliberately, and they can withdraw. Trust is engineered (explicit, just-in-time, granular consent; plain language; visible "process-then-purge"), not decorated with a padlock emoji.
2. **Fast and effortless.** Optimistic, zero-latency-feeling interactions; instant validation; a wait state that *respects the wait* instead of hiding it. Nothing blocks that can be done in the background.
3. **Quietly delightful.** Restraint, not fireworks. The delight is in the **reveal** of the result and the **smoothness** of the compare — earned moments, not gratuitous animation.

### The North-Star sentence
> "I dropped in a selfie, I understood exactly what would happen to it, it felt safe, the wait was honest, and seeing myself in the item was a genuine little moment — then buying was one tap."

---

## 3. Design principles (the bar)

1. **Consent is a feature, not a checkbox.** The privacy moment is a designed, first-class screen — equal visual weight on accept and decline, plain-language *what/why/how-long*, just-in-time (asked at the moment of relevance, never upfront-and-buried). No dark patterns, no pre-ticked boxes, no tricking anyone into uploading. (`claude.md` §5.6, §3.14.)
2. **Reframe the selfie as a fitting, not a beauty shot.** Copy and framing guidance lower the emotional stakes ("a clear, full-length photo helps us fit the item" — a measurement, not a judgement). Instruct **before** capture, never scold after failure.
3. **Honesty over hype for generative output.** Set expectations: this is an AI preview, fit/details may not be exact. Low-stakes, honest disclaimers build more trust than pretending the render is a photograph.
4. **Respect the wait.** Async inference gets a *designed* wait state with a layout-mirroring skeleton, an honest time expectation, and reassurance — never a naked spinner, never a fake progress bar that lies.
5. **Restraint is confidence.** Whitespace, one rationed accent, one repeated layout primitive. A quiet interface reads as expensive and reads as safe. Loud reads as a scam — fatal for a photo-upload product.
6. **The reveal is the payoff.** The before→after compare is the emotional climax. It gets the best motion craft in the product (a smooth slider / crossfade), and nothing else competes with it.
7. **Every pixel is a guest.** The widget loads on a retailer's site. It must be **self-contained, theme-aware (light/dark), shadow-DOM isolated**, never leak styles, and degrade gracefully if the host is hostile or slow.
8. **Nothing static, everything wired.** No dead buttons, placeholder links, or fake hard-coded results dressed up as real (§3.14). Every visible/clickable element fires a real action against real-shaped data, across all states — proven by the live Playwright suite (§4.9).
9. **Accessible by construction.** WCAG 2.2 AA is a floor: visible focus, full keyboard path, ≥4.5:1 text contrast, `prefers-reduced-motion` honored, screen-reader-announced state changes (the job moving `processing → succeeded` is an ARIA live announcement, not a silent swap).

---

## 4. The anti-"AI-slop" / anti-vibe-coded ban (binding)

This product will be judged on whether it looks **designed** or **generated**. The following are **banned**, with the required alternative. (Distilled from the competitive teardown; enforced in `design-tokens.md`.)

| Banned "AI-slop" tell | Required instead |
| --- | --- |
| **Generic gradient-on-white cards** (lavender/blurple `#a→#b` gradients) | Solid, intentional surfaces; one disciplined accent; depth from light/dark surface stack, not gradient fills |
| **Identical drop-shadow on every element** | Shadow only signals genuine elevation; a **narrow surface stack** + **1px inset borders** carry most depth (the premium tell from Linear/Vercel) |
| **Template card-grid** of icon-on-top feature cards, numbered 1·2·3 | **One strong layout primitive repeated** until it becomes the signature; this is a linear *flow*, not a dashboard of cards |
| **Sterile / cold even-spacing** (everything 16px apart) | A real **modular spacing scale** with deliberate rhythm — tight where grouped, generous where separated; whitespace is composed, not uniform |
| **Default Inter 400/700 everywhere** | A distinctive grotesk at **custom weights** (e.g. 460/560/640) so it escapes the default-Inter look; one intentional type pairing |
| **Glassmorphism / frosted everything**, colored left-border cards, emoji icons, all-caps micro-labels | Solid surfaces; custom minimal line icons (or none); sentence-case humane copy |
| **Bounce / spring / overshoot motion** | Sharp **ease-out** entrances, short durations; serious products don't bounce (a photo-trust product *especially* doesn't) |
| **Unmodified shadcn/library defaults** | Every token (radius, shadow, color, weight) is a deliberate decision specified in `design-tokens.md` — silence = AI defaults |
| **Stock-illustration "happy diverse people" hero art** | Real product imagery / the user's own result is the only imagery; no decorative stock |

**Originality is scored explicitly. "It works" is not enough.** If a reviewer can name the template, we have failed.

---

## 5. What to take from each researched product (inspiration, never cloning)

Patterns and principles only — **never pixels or brand identity**, blended across many sources so no single one is identifiable in the result (§3.14).

### Virtual try-on leaders

- **Google Shopping "Try-on" / Doppl (generative apparel).** Take: the **instruct-before-capture** guidance (good lighting, clean background, full-length, fitted clothing, no other people, no children); the **explicit consent-ownership** line ("you're responsible for consent of anyone in the photo"); the **biometric/no-training/no-sharing** reassurance stated *up front*; and the **honest "may not be exact" disclaimer** for generative output. We adapt the *structure* of that consent + guidance, written in our own humane voice.
- **Doppl specifically.** Take: **motion conveys fit better than a static image** — informs a future "see it move" enhancement, and the idea that the result deserves a moment, not a thumbnail.
- **Warby Parker / Zenni (eyewear).** Take: **reframe capture as a mirror/fitting**, just-in-time camera permission, and **local-only / minimal-exposure messaging as the headline trust signal** ("your photo is processed then purged" — the apparel analogue of Zenni's "stored locally, never uploaded").
- **Sephora Virtual Artist (makeup).** Take: the **split-screen before/after slider** — the single most powerful confidence cue we found; it becomes our primary result-compare interaction. Also their lesson on **discoverability** — surface the launcher aggressively; a hidden try-on is a wasted one.
- **Nike (Fit / Virtual View).** Take: **precision-as-trust** framing (a "fitting," millimetre language) and the **graceful fallback** philosophy — there's always a next step, never a dead end.

### Best-in-craft product UX

- **Apple (product pages / privacy).** Take: **restraint, composed whitespace, privacy-by-design** (opt-in, granular, plain-language, easy withdrawal, no dark patterns), and motion that supports content and never distracts.
- **Stripe.** Take: **one disciplined accent on a near-monochrome high-contrast canvas**, a tiny token set where richness comes from contrast/hierarchy, and **trust through transparency** (clear state, honest errors).
- **Linear / Vercel.** Take: **custom font weights** to escape default-Inter, **depth via 1px border + soft shadow, not fills**, a **narrow surface stack**, **single rationed accent per screen**, **intentional dark mode** (re-tuned, not inverted), and **optimistic UI** (act instantly, reconcile after).
- **ASOS / FARFETCH.** Take: **reduce decision anxiety before an irreversible action** — keep the primary action (add-to-cart) **persistently reachable**, confirm exact state (product, size) before commit, and surface confidence inline.

**The blend:** Apple/Linear restraint + Stripe's disciplined accent + Sephora's before/after slider + Google/Zenni's consent-and-purge trust grammar + ASOS's sticky, anxiety-reducing commit — reinterpreted through TryIt's own lens. No single source is recognizable in the output.

---

## 6. Tone of voice (microcopy)

- **Plain, warm, human, never corporate-legal in the UI** (the legal text lives in a linked policy, not in the consent button).
- **Non-blaming on failure:** "Let's try a clearer photo" not "Invalid image." The user is never at fault.
- **Honest about AI:** "This is an AI preview — fit and details may not be exact."
- **Specific reassurance:** "Your photo is used only to create this preview, then deleted. We never use it to train AI or share it." (Reflects the `process-then-purge` posture in the README and threat model.)
- **Calm under pressure:** rate-limit / budget / kill-switch states stay friendly and blame the system, not the shopper ("We're busy right now — try again in a moment").

---

## 7. Definition of Done (UI gate — owned here, enforced at §4.9)

The widget ships only when **all** pass:
1. **Live E2E Playwright suite green** — every button, input, link, dropzone, slider, and flow exercised in a real browser, happy-path **and** every failure/edge path, asserting real actions and correct end states.
2. **WCAG 2.2 AA** — automated (axe) **and** manual keyboard / focus-order / screen-reader / reduced-motion passes.
3. **Responsive** at every breakpoint (the widget renders as a bottom-sheet on mobile, a centered modal on desktop — see `flows.md`).
4. **Core Web Vitals budget** met (LCP < 2.5s, CLS < 0.1, INP < 200ms via Lighthouse); widget bundle is lean and lazy-loaded.
5. **Design-token adherence** — zero hard-coded colors / sizes / radii / durations; everything from `design-tokens.md`.
6. **All states present** — loading / empty / error / edge for every component (`component-inventory.md`).
7. **Cross-browser** (Chromium, WebKit, Firefox) and **light + dark**, **shadow-DOM isolated** on a hostile host page.
8. **Nothing static** — every control wired to real, real-shaped behavior; no faked results.
9. **Originality** — passes the §4 anti-slop ban under independent (different-agent) review.
