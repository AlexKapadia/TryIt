# TryIt Engine — Evidence-Backed Recommendation

> Synthesizes the research in this folder into a concrete architecture decision. Every claim
> traces to a paper or provider note here. This is a recommendation to ratify, not yet built.

## Constraints (the bar everything is judged against)

Millions of try-on calls/day · low cost per call · low latency · apparel-first · pluggable,
provider-agnostic engine · commercial use must be legally clean.

## Recommendation (summary)

1. **Pluggable provider engine** behind one internal contract, with **fal.ai as the live hosted
   default** (FASHN / Kling / Leffa endpoints).
2. **Self-hosted open-model path** as the cost/independence lever: **adopt the CatVTON
   architecture** as the self-host base, with **Leffa (MIT)** as the commercially-clear
   checkpoint we can run today and benchmark against.
3. **Content-addressed caching as the primary cost lever** — cache keyed on a hash of
   (person image, garment image, params); a cache hit is ~free vs ~$0.04-0.10 + seconds of GPU.
4. **Deterministic fallback** when all engines fail/are disabled — fail closed to a safe,
   non-fabricated response.

## 1. Why a pluggable provider engine

No single provider is best on all axes, and prices/terms drift (see `provider-survey.md`). A
thin internal contract (person image, garment image, category, params -> rendered image +
metadata) lets us swap fal / Replicate / Vertex / self-host per cost, latency, region, and
licensing, and run A/B and failover. This is also the §3.4 evidence-driven posture: candidates
compete behind one interface and the winner is chosen by measured metrics, not taste.

## 2. Why fal.ai as the hosted default

From `provider-survey.md`: fal offers **fixed per-image pricing ($0.04-$0.10)**,
**commercial-cleared** flagship models (FASHN v1.6, Kling Kolors, Leffa), **~15 s** latency, and
**no user-supplied mask** requirement. Fixed per-image cost is far easier to budget at millions
of calls/day than Replicate's per-GPU-second billing, and avoids Replicate's headline
non-commercial license problem (its IDM-VTON is CC BY-NC-SA). Google Vertex is GA and
commercial-OK but throttled to ~50 req/min by default and its per-image price is unverified —
keep it as an enterprise/region option, not the default.

## 3. Self-host base: recommend CatVTON architecture (with Leffa as the MIT checkpoint)

Decision matrix across the studied open models:

| Model | License (released weights) | Base | VRAM | Latency | Quality (own paper) | Self-host verdict |
| ----- | -------------------------- | ---- | ---- | ------- | ------------------- | ----------------- |
| **CatVTON** | CC BY-NC-SA + SD1.5 OpenRAIL | SD1.5 | **<8 GB @1024x768** (3.3-5.9 GB) | **2.6 s @512 / 9.3 s @1024** | VITON-HD paired FID 5.43 / LPIPS 0.0565 | **Architecture = our base** |
| IDM-VTON | CC BY-NC-SA + SDXL | SDXL | not published (heavy) | ~18-19 s (A100, 3rd-party) | VITON-HD LPIPS 0.102 / FID 6.29 | Quality north star, too heavy/NC |
| OOTDiffusion | CC BY-NC-SA + SD1.5 OpenRAIL | SD1.5 | not published | not published | VITON-HD FID 8.81 (512) | Take outfitting-dropout idea only |
| **Leffa** | **MIT** (+ SD1.5 base) | SD1.5 dual-UNet | ~12 GB (community) | ~6 s (A100) | strong (single-source) | **MIT checkpoint = run today** |

**Why CatVTON as the architecture:** it is the **only model in the set that fits "low cost, low
latency at scale"** — single UNet via spatial concatenation, **<8 GB VRAM**, **~2.6 s at
512x384**, deployable on commodity GPUs, with only **49.57M trainable params** (~5.5%) so we can
**fine-tune on our own apparel cheaply**. Its quality is competitive (beats IDM-VTON on VITON-HD
paired in the paper). The catch: the **released CatVTON checkpoint is CC BY-NC-SA + SD1.5
OpenRAIL = non-commercial**, so we adopt the **method** and fine-tune/retrain a commercially-clear
variant — we do not monetize the released weights.

**Why Leffa is paired with it:** Leffa's **code AND weights are MIT** — the **only commercially
clean** open checkpoint here. So the practical plan is: **run the MIT Leffa checkpoint today**
(commercially safe, ~6 s/A100, also available hosted on fal) as our self-host benchmark, and
**adopt the parameter-free Leffa loss when we fine-tune a CatVTON-style base** for a near-free
fidelity gain. IDM-VTON stays the **quality north star** (architecture reference for two-path
garment conditioning) but is ruled out for self-host on compute + NC license. OOTDiffusion
contributes only its **outfitting-dropout / CFG-over-garment-strength** idea.

## 4. Caching as the primary cost lever

`provider-survey.md` establishes every render is GPU-bound seconds-per-image. Apparel try-on has
heavy repetition: the same SKU is tried by many users, and a returning user re-tries the same
garments. **Content-addressed cache** keyed on `hash(person_image_bytes + garment_image_bytes +
engine + params)` turns repeats into ~free lookups. This is the single biggest cost reduction
available and is **provider-independent** — it sits in front of the pluggable engine. (Security:
hash inputs, never store raw PII person images longer than necessary; fail closed on cache
errors rather than re-billing silently.)

## 5. Deterministic fallback

When every engine is disabled (kill-switch), over budget, or failing, the engine must **fail
closed** (§5.6): return a clear, non-fabricated "try-on unavailable" response with the original
product image — never a hallucinated or wrong-garment result passed off as real.

## Golden set + metric (how we pick between candidates later)

- **Golden set:** the **VITON-HD test split (2,032 paired apparel pairs)** as the comparable,
  published-benchmark backbone (research/eval use only — CC BY-NC), **plus an in-house labelled
  apparel set** of our own SKUs across tops / bottoms / dresses and diverse body types/poses to
  guard against overfitting to VITON-HD's frontal-woman-tops distribution.
- **Metrics** (per `method-space-survey.md` S4):
  - **Paired (reconstruction):** **SSIM** and **LPIPS** (garment/structure fidelity vs ground
    truth).
  - **Unpaired (garment swapped onto a different person):** **FID** and **KID** (distributional
    realism).
  - **CLIP-I** for garment-semantic alignment.
  - **Operational:** p50/p95 **latency**, **$/1k renders**, **cache hit-rate**.
- **Selection rule:** every candidate (fal FASHN, fal Kling, fal/MIT Leffa, self-host
  CatVTON-tuned) is run on the **same golden set under the same conditions**; the winner per
  segment is chosen on a pre-agreed weighting of LPIPS/SSIM/FID + latency + $/render, and **why
  it won is recorded with the numbers** (S3.4 / S4.5). `main` carries only the winner; losing
  experiments live on `experiment/<approach>` branches and are deleted when they lose.

## Open items to verify before building

- fal IDM-VTON/CatVTON commercial terms + real prices; Vertex per-image price (all flagged in
  `provider-survey.md`).
- Re-verify Leffa's metrics against the PDF and on our own golden set (current numbers are
  single-source).
- Confirm a commercially-clear training-data + base-model path for the CatVTON-architecture
  retrain (SD1.5 OpenRAIL constraints on any base we fine-tune from).
