# VITON-HD — Best Parts to Take (for TryIt)

TryIt constraints: millions of try-on calls/day, low cost, low latency, apparel-first,
pluggable engine.

## What to adopt

1. **The VITON-HD dataset as our golden-set backbone.** Its 1024x768 apparel pairs (2,032 test
   pairs) are the field-standard benchmark every modern method reports on. TryIt should build
   its **labelled apparel golden set on top of VITON-HD** (plus our own in-house SKUs) so our
   SSIM/LPIPS/FID scores are **directly comparable to published numbers** — this is how we pick
   between candidate engines objectively (see `decision.md`).
   *Caveat: VITON-HD is CC BY-NC — research/eval use only; do not redistribute commercially.*

2. **The misalignment lesson, as a design negative.** ALIAS exists purely to paper over
   warp-vs-body misalignment artifacts. This is the strongest argument **for** the diffusion
   (warping-free, attention-aligned) direction TryIt is choosing — VITON-HD documents exactly
   the failure mode we avoid by not warping.

3. **Single-forward-pass speed, as the latency target to beat... carefully.** A GAN renders in
   one pass (sub-second class), far faster than multi-step diffusion. We are NOT adopting GANs
   (quality is too low for apparel-first), but the GAN latency profile is the reason **caching
   and few-step diffusion** matter so much — it sets the bar diffusion must approach via the
   cache.

## What NOT to adopt

- **Do not use a GAN as a TryIt engine.** Lower texture/pose fidelity, brittle multi-stage
  pipeline, and a non-commercial dataset/code license. It is a **baseline and a benchmark
  source**, not a candidate engine.

## Net

VITON-HD's enduring value to TryIt is its **dataset/benchmark** (the foundation of our golden
set and the basis for comparing engines against published SSIM/LPIPS/FID), and its **documented
misalignment failure mode** that justifies choosing warping-free diffusion. The model itself is
superseded.
