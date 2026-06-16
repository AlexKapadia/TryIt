# Hosted Virtual Try-On API Provider Survey

> Compares hosted try-on APIs for TryIt's pluggable engine (millions of low-cost, low-latency
> apparel calls/day). **All prices/latency seen 2026-06-16 and drift — re-verify live.**

## Cost lever (the case for caching)

Try-on diffusion inference is **GPU-bound and seconds-per-image**: IDM-VTON ~12.3 s on the
diffusion model alone (arXiv:2503.20418), ~18-19 s end-to-end on an A100 80GB in deployment
(Replicate). Because each (person, garment) render costs real GPU-seconds and is
near-deterministic, **content-addressed caching of repeated (person,garment) pairs is the
primary cost/latency lever** at scale — independent of provider.
Source: https://arxiv.org/pdf/2503.20418 · https://replicate.com/cuuupid/idm-vton

## A) fal.ai — per-image pricing, commercial-cleared, lowest friction

| Model | Underlying | Endpoint | Price/image | Latency | Inputs | Commercial |
| ----- | ---------- | -------- | ----------- | ------- | ------ | ---------- |
| FASHN Try-On v1.6 | FASHN (proprietary) | `fal-ai/fashn/tryon/v1.6` | **$0.075** | ~15 s (v1.5 figure) | person + garment, no mask, auto-category | **Yes** |
| FASHN v1.5 | FASHN | `fal-ai/fashn/tryon/v1.5` | $0.075 | ~15 s | person + garment, auto tops/bottoms/one-piece | Yes |
| Kling Kolors VTON | Kuaishou Kling/Kolors | `fal-ai/kling/v1-5/kolors-virtual-try-on` | **$0.07** | not published | person + garment (flat-lay), no mask | Yes |
| Leffa VTON | Leffa (MIT) | `fal-ai/leffa/virtual-tryon` | **$0.10** | not published | person + garment + garment type | Yes |
| Virtual Try-On (apps) | undisclosed | `fal-ai/image-apps-v2/virtual-try-on` | **$0.04** (cheapest verified) | not published | person + clothing, optional preserve-pose | Yes |
| IDM-VTON | IDM-VTON (academic) | `fal-ai/idm-vton` | unverified (page placeholder) | not pub. | person + garment + text | **Not stated** — flag |
| CatVTON | CatVTON | `fal-ai/cat-vton` | unverified placeholder | not pub. | person + garment + cloth type | **"Research only"** |

Sources: https://fal.ai/models/fal-ai/fashn/tryon/v1.6 · https://fal.ai/models/fal-ai/fashn/tryon/v1.5 ·
https://fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on · https://fal.ai/models/fal-ai/leffa/virtual-tryon ·
https://fal.ai/models/fal-ai/image-apps-v2/virtual-try-on · https://fal.ai/models/fal-ai/cat-vton ·
https://blog.fal.ai/new-sota-virtual-try-on-model-by-fashn-live-on-fal/

**Suitability:** strongest fit — **fixed per-image pricing** (no GPU-second accounting),
commercial-cleared flagship models (FASHN / Kling / Leffa), no user-supplied masks. Avoid
CatVTON (research-only) and treat fal's IDM-VTON terms as unverified. `easel-ai/fashion-tryon`
is **deprecated** — don't use.

## B) Replicate — per-GPU-second billing, mostly non-commercial licenses

Per-second rates: T4 $0.000225 · L40S $0.000975 · A100-80GB $0.0014 · H100 $0.001525. Public
models bill only **active run time** (cold-start/idle not billed). **The model author sets the
license; the user is solely responsible for compliance.**
Sources: https://replicate.com/pricing · https://replicate.com/terms

| Model | Underlying | GPU | Cost/run | Latency | License |
| ----- | ---------- | --- | -------- | ------- | ------- |
| `cuuupid/idm-vton` | IDM-VTON | A100-80GB | **$0.025 (~40/$1)** | ~19 s | **CC BY-NC-SA 4.0 — non-commercial** |
| `viktorfa/oot_diffusion` | OOTDiffusion | L40S | ~$0.15 (~6/$1) | **~3 min** | unverified; upstream non-commercial |
| `mmezhov/catvton-flux` | CatVTON + FLUX.1-Fill | A100-80GB | ~$0.15 | ~104 s | unverified; CatVTON + FLUX-dev both non-commercial |
| `growthmkt/virtualtryon` | OOTDiffusion | — | — | — | no enabled versions — not runnable |

Inputs: person + garment image; IDM-VTON/CatVTON add category + optional mask (auto if absent).
Sources: https://replicate.com/cuuupid/idm-vton · https://replicate.com/viktorfa/oot_diffusion ·
https://replicate.com/mmezhov/catvton-flux

**Suitability:** good for prototyping/flexibility, but **headline models carry non-commercial
licenses** (IDM-VTON explicitly CC BY-NC-SA) — a commercial blocker, and liability sits with us.
Per-second billing is less predictable than fal's per-image; OOTDiffusion at ~3 min is too slow.

## C) Google — consumer feature is NOT an API; Vertex AI is the callable one

**(1) Google Shopping Virtual Try-On = consumer UX feature, not a merchant API.** Merchants
participate passively via Merchant Center free listings (images >=512px, ideally >=1024px). No
programmatic call. US + UK + India, expanding. **Disqualified** for a pluggable engine.
Sources: https://support.google.com/merchants/answer/16159685 · https://support.google.com/merchants/answer/14096369

**(2) Vertex AI Virtual Try-On = real REST/Python API.** Model **`virtual-try-on-001`, GA
2026-01-20** (preview `virtual-try-on-preview-08-04` through 2025; discontinuation planned
2027-01-20). Inputs: person image + product image(s), base64 or GCS, <=10 MB, up to 4
images/call; C2PA watermarking.
- **Pricing: UNVERIFIED** — listed in the Imagen section of Vertex pricing but not extractable
  from primary pages (JS-rendered). Do not quote without checking
  https://cloud.google.com/vertex-ai/generative-ai/pricing#imagen-models live.
- **Suitability caveat:** documented default quota **~50 requests/min per base model** — **not
  suitable for high-volume low-latency** without Provisioned Throughput / quota increases.
  GA = standard Cloud Service Terms (commercial OK).
Sources: https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images ·
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/virtual-try-on-api

## Bottom line for TryIt

- **Best hosted default: fal.ai** — per-image pricing ($0.04-$0.10), commercial-cleared
  flagship models, ~15 s, no mask handling. Use FASHN / Kling / Leffa; skip fal CatVTON
  (research-only).
- **Replicate** — flexible, cheap per-run for IDM-VTON ($0.025/run, ~19 s), but **non-commercial
  licenses block production** and per-second billing is less predictable. Good for eval/dev.
- **Google Vertex AI** — legitimate GA enterprise API (commercial OK), but **default 50 req/min
  throttle needs Provisioned Throughput** for scale and **per-image price is unverified**. The
  consumer Shopping try-on is not an API.
- **Caching (person,garment) pairs dominates cost** regardless of provider.

## Flagged unverified

fal IDM-VTON/CatVTON real prices + IDM-VTON commercial terms; Replicate OOTDiffusion/CatVTON-flux
license fields; Vertex per-image price and region list; all per-image/per-second prices are
date-stamped 2026-06-16 and may be stale.
