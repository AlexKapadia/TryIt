# TryIt — Design Tokens

> **Owner:** CDO / Head of Design. The single source of truth for every visual decision in the widget. **Zero hard-coded values** in components — everything references a token here. Silence in the token system = AI defaults; so every value is deliberate (`design-brief.md` §4).
> **Implementation:** ship as CSS custom properties scoped to the widget's **shadow root** (`:host`) so nothing leaks to or from the retailer's page. Light is default; dark is a `:host([data-theme="dark"])` / `prefers-color-scheme` override — **re-tuned, not inverted**.

---

## 1. Color

### 1.1 Philosophy
A **near-monochrome, high-contrast canvas** with **one rationed accent** (Stripe/Linear discipline). The accent appears on **the single primary action per screen** and the result-reveal — nowhere decorative. Color is carried by contrast and hierarchy, not by many hues. **No gradients on surfaces** (anti-slop §4). Depth comes from a **narrow surface stack** + 1px borders, not fills or shadows.

### 1.2 Brand & accent

The accent is a **deep, calm teal-ink** — distinct from the lavender/blurple "vibecode" cliché, and it reads as *trust/clinical-calm* rather than *hype*. Paired with a warm-neutral canvas so it never feels cold/sterile.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ti-accent` | `#0E7C7B` | `#2DD4BD` | Primary action, focus accents, result-reveal highlight |
| `--ti-accent-hover` | `#0B6463` | `#5EE6D8` | Primary action hover |
| `--ti-accent-active` | `#094F4E` | `#8BF0E6` | Primary action pressed |
| `--ti-accent-subtle` | `#E6F2F2` | `#0E2A2A` | Selected variant ring, info wash (used sparingly) |
| `--ti-on-accent` | `#FFFFFF` | `#04201F` | Text/icon on accent surfaces (≥4.5:1) |

### 1.3 Neutrals (warm-grey, not pure grey — avoids the cold/sterile tell)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ti-canvas` | `#FBFAF8` | `#0C0D0F` | Widget background |
| `--ti-surface` | `#FFFFFF` | `#16181C` | Cards / panels (surface stack step 1) |
| `--ti-surface-raised` | `#FFFFFF` | `#1E2126` | Elevated (dropzone, result) (step 2) |
| `--ti-surface-sunken` | `#F4F2EE` | `#0A0B0D` | Inset wells, skeleton base |
| `--ti-border` | `#E7E3DC` | `#2A2D33` | 1px hairline borders (primary depth cue) |
| `--ti-border-strong` | `#D2CCC1` | `#3A3E45` | Focused/active borders, dividers |
| `--ti-text` | `#1A1A17` | `#F4F3F0` | Primary text (≥7:1 — AAA where cheap) |
| `--ti-text-secondary` | `#5A574F` | `#A8A59C` | Secondary/body text (≥4.5:1 AA) |
| `--ti-text-tertiary` | `#86827A` | `#76736B` | Hints, captions, metadata (≥4.5:1 on its surface) |
| `--ti-text-disabled` | `#B4B0A7` | `#4D4F54` | Disabled (non-essential, contrast-exempt but legible) |

### 1.4 Semantic tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ti-success` | `#15803D` | `#4ADE80` | Added-to-cart, success ticks |
| `--ti-success-subtle` | `#E8F5EC` | `#0E2616` | Success wash |
| `--ti-warning` | `#B45309` | `#FBBF24` | Rate-limited / busy, soft warnings |
| `--ti-warning-subtle` | `#FBF0E2` | `#2A1F0A` | Warning wash |
| `--ti-danger` | `#B91C1C` | `#F87171` | Errors, destructive (remove photo) |
| `--ti-danger-subtle` | `#FBEAEA` | `#2A0E0E` | Error wash |
| `--ti-focus-ring` | `#0E7C7B` | `#2DD4BD` | 2px focus outline (= accent; never removed) |
| `--ti-overlay` | `rgba(20,18,15,0.48)` | `rgba(0,0,0,0.64)` | Scrim behind modal/bottom-sheet |

**Error→token map** (mirrors `errors.ts`): `INVALID_INPUT` / `PAYLOAD_TOO_LARGE` → `--ti-danger` (user-correctable); `RATE_LIMITED` / `BUDGET_EXCEEDED` / `KILL_SWITCH_ENGAGED` → `--ti-warning` (system, wait); `PROVIDER_ERROR` → `--ti-warning` (retryable); `UNAUTHORIZED` → `--ti-danger` (config dead-end, retailer-facing).

### 1.5 Contrast guarantees (WCAG 2.2 AA)
- Body text on every surface it appears on: **≥ 4.5:1**. Primary text targets **≥ 7:1** (AAA) where free.
- `--ti-on-accent` on `--ti-accent`: **≥ 4.5:1** in both themes (verified for `#FFFFFF` on `#0E7C7B` ≈ 4.9:1; `#04201F` on `#2DD4BD` ≈ 9:1).
- Non-text UI (borders of inputs, focus ring, icon affordances): **≥ 3:1**.
- Never encode state with color alone — pair with icon + text (color-blind safe).

---

## 2. Typography

### 2.1 Family

A distinctive **humanist grotesk** that reads as modern and trustworthy without the default-Inter signature. Use **custom weights** (not 400/700) to escape the AI-slop tell.

```
--ti-font-sans: "Geist", "Hanken Grotesk", "Inter", system-ui, -apple-system,
                "Segoe UI", Roboto, sans-serif;
--ti-font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, "SF Mono",
                "Cascadia Code", monospace;
```

- **Primary:** Geist (or Hanken Grotesk as the self-hosted fallback) — both are open-license, variable, and have humanist warmth. System-ui closes the stack for zero-FOUT resilience inside a third-party widget.
- **Mono** appears only in tiny metadata (e.g. a render id in dev), never in shopper copy.
- **Loading:** `font-display: swap`; the system fallback is metric-matched so CLS stays < 0.1.

### 2.2 Weights (custom — the anti-default-Inter move)

| Token | Value | Use |
| --- | --- | --- |
| `--ti-weight-regular` | `420` | Body, secondary text |
| `--ti-weight-medium` | `520` | Labels, buttons, emphasized body |
| `--ti-weight-semibold` | `600` | Sub-headings, primary button |
| `--ti-weight-bold` | `680` | The single screen headline / result moment |

### 2.3 Type scale (modular, ratio ≈ 1.2 "minor third", 16px base)

| Token | Size / line-height / tracking | Weight | Use |
| --- | --- | --- | --- |
| `--ti-text-display` | `28px / 34px / -0.02em` | 680 | Result reveal headline ("Here's your fit") |
| `--ti-text-title` | `22px / 28px / -0.01em` | 600 | Screen titles (consent, upload) |
| `--ti-text-subtitle`| `18px / 26px / -0.005em` | 520 | Section headers, product name |
| `--ti-text-body` | `16px / 24px / 0` | 420 | Default body, guidance copy |
| `--ti-text-body-sm` | `14px / 21px / 0` | 420 | Secondary body, helper text |
| `--ti-text-label` | `13px / 18px / 0.005em` | 520 | Buttons, input labels, chips |
| `--ti-text-caption` | `12px / 16px / 0.01em` | 420 | Metadata, legal microcopy, hints |

Hero/headline sizes carry **negative tracking** (cohesion at size); small sizes get **slightly positive tracking** (legibility). No all-caps labels (anti-slop) — sentence case throughout. Minimum on-screen size **12px**; touch-target labels never below 13px.

---

## 3. Spacing

A **4px base grid** with a non-uniform, composed scale (rhythm, not even-spacing). Tight inside a group, generous between groups — whitespace is *composed*, never the same gap everywhere (anti-slop §4).

| Token | px | Typical use |
| --- | --- | --- |
| `--ti-space-0` | 0 | reset |
| `--ti-space-1` | 4 | icon↔label, hairline insets |
| `--ti-space-2` | 8 | within a control, chip padding |
| `--ti-space-3` | 12 | label↔input, tight stacks |
| `--ti-space-4` | 16 | default block gap, button padding-x |
| `--ti-space-5` | 24 | between grouped sections |
| `--ti-space-6` | 32 | screen padding (mobile), between major regions |
| `--ti-space-7` | 48 | between major regions (desktop), generous breathing |
| `--ti-space-8` | 64 | empty-state vertical centering, hero pad |

**Container:** widget content max-width `--ti-widget-max: 440px` (modal) / full-width bottom-sheet on mobile. Screen padding `--ti-space-6` mobile, `--ti-space-7` desktop.

---

## 4. Radii

Soft but not pill-everything — a deliberate, restrained radius family.

| Token | px | Use |
| --- | --- | --- |
| `--ti-radius-sm` | 8 | chips, inputs, small controls |
| `--ti-radius-md` | 12 | buttons, cards |
| `--ti-radius-lg` | 16 | panels, dropzone, result frame |
| `--ti-radius-xl` | 24 | the widget sheet/modal shell |
| `--ti-radius-full` | 9999 | launcher button, avatar, progress dot |

---

## 5. Elevation (narrow surface stack — depth from border + soft shadow, never fills)

The premium tell: **1px borders carry most depth; shadows are reserved for genuine elevation** and are soft/low-spread (no uniform drop-shadow on everything — anti-slop §4). Dark mode lowers shadow opacity and leans on the surface stack + borders.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ti-elev-0` | `none` | `none` | Flush content; depth from `--ti-border` only |
| `--ti-elev-1` | `0 1px 2px rgba(20,18,15,0.06), 0 0 0 1px var(--ti-border)` | `0 0 0 1px var(--ti-border)` | Resting cards, inputs |
| `--ti-elev-2` | `0 4px 12px rgba(20,18,15,0.08), 0 0 0 1px var(--ti-border)` | `0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px var(--ti-border)` | Dropzone hover, menus |
| `--ti-elev-3` | `0 12px 32px rgba(20,18,15,0.14), 0 0 0 1px var(--ti-border)` | `0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px var(--ti-border-strong)` | The widget sheet/modal shell |
| `--ti-elev-focus` | `0 0 0 2px var(--ti-canvas), 0 0 0 4px var(--ti-focus-ring)` | same pattern | Keyboard focus ring (offset, always visible) |

---

## 6. Motion

Premium = **short, ease-out, purposeful, one thing at a time**. **No bounce / spring / overshoot** — a photo-trust product must feel composed, not toy-like (anti-slop §4). Every motion token has a **`prefers-reduced-motion` fallback** that drops to an opacity-only or instant change.

### 6.1 Durations

| Token | ms | Use |
| --- | --- | --- |
| `--ti-dur-instant` | 80 | press feedback, hover color |
| `--ti-dur-fast` | 160 | micro-interactions: toggle, chip select, tooltip |
| `--ti-dur-base` | 240 | default: control state changes, input focus |
| `--ti-dur-slow` | 400 | screen/step transitions, sheet open/close |
| `--ti-dur-reveal` | 560 | the result reveal crossfade (the one earned, longer moment) |

Scale duration to spatial distance — bigger movement → longer (capped at `--ti-dur-reveal`).

### 6.2 Easing

| Token | curve | Use |
| --- | --- | --- |
| `--ti-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | **Default — entrances**: things arriving decelerate to rest |
| `--ti-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | exits: things leaving accelerate away |
| `--ti-ease-inout` | `cubic-bezier(0.4, 0, 0.2, 1)` | continuous moves (slider drag, sheet) |
| `--ti-ease-linear` | `linear` | indeterminate progress shimmer only |

### 6.3 Signature motions
- **Result reveal:** crossfade selfie→result over `--ti-dur-reveal` with `--ti-ease-out`, plus a 2px accent underline sweeping under the headline. The product's emotional climax — nothing else animates during it.
- **Compare slider:** the before/after divider tracks the pointer 1:1 (`--ti-ease-inout`), with a subtle handle grow on grab (`--ti-dur-fast`).
- **Processing skeleton:** a slow shimmer (1400ms `--ti-ease-linear` loop) over a layout-mirroring skeleton — never a spinner alone.
- **Reduced motion:** reveal becomes an instant crossfade (opacity, 1 frame); shimmer becomes a static muted fill; slider still works (it's user-driven, not animated).

### 6.4 Optimistic UI
Inputs respond **instantly** (selected chip highlights before any network); the job-status poll reconciles in the background. Perceived latency → near zero (the Linear principle).

---

## 7. Z-index & layout scaffolding

| Token | value | Use |
| --- | --- | --- |
| `--ti-z-launcher` | 2147483000 | floating launcher above host page |
| `--ti-z-overlay` | 2147483600 | scrim |
| `--ti-z-sheet` | 2147483601 | modal/bottom-sheet shell |
| `--ti-z-toast` | 2147483647 | transient announcements (max, so host can't cover it) |

High z-indices are intentional: the widget is a guest and must sit above arbitrary host stacking contexts; pair with **shadow-DOM isolation** so this never bleeds into host styles.

---

## 8. Breakpoints

| Token | min-width | Layout |
| --- | --- | --- |
| `--ti-bp-mobile` | 0 | full-width **bottom-sheet**, single column, thumb-reachable primary action |
| `--ti-bp-tablet` | 600px | centered sheet, wider gutters |
| `--ti-bp-desktop` | 960px | centered **modal** at `--ti-widget-max`, side-by-side compare where space allows |

---

## 9. Token governance
- Components reference tokens **only** — a hard-coded hex/px/ms in a component is a lint failure and a DoD blocker (`design-brief.md` §7).
- Dark mode is **re-tuned per token above**, never a programmatic invert.
- Any new value must be added here first, with a stated reason, before use.
