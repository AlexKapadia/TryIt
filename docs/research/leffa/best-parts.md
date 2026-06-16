# Leffa — Best Parts to Take (for TryIt)

TryIt constraints: millions of try-on calls/day, low cost, low latency, apparel-first,
pluggable engine.

## What to adopt

1. **The Leffa loss as a fidelity upgrade to whatever base we train.** It is a **parameter-free
   training-time regularizer** that reduces garment/identity distortion by forcing attention to
   the correct reference region. If TryIt fine-tunes a self-host base (e.g. CatVTON-style), the
   Leffa loss is a **near-free quality lever** — no inference cost, no extra params, applied
   only during training. This is the single most reusable idea here.

2. **Permissive MIT license = the one commercially-clear open option.** Unlike IDM-VTON /
   CatVTON / OOTDiffusion (all CC BY-NC-SA), Leffa's **code AND weights are MIT**. That makes
   the released Leffa checkpoint a **legitimate commercial self-host candidate** (subject only
   to the SD1.5 base-model terms), and a benchmark we can actually ship.

3. **Hosted on fal.ai with commercial terms** (`fal-ai/leffa/virtual-tryon`, ~$0.10/image) —
   so it doubles as a provider-backed option in our pluggable engine without us operating GPUs.

## What to weigh

- **Numbers are single-source (HTML render).** Before we rank Leffa on quality, re-verify its
  metrics against the PDF and, better, **run it on our own golden set** — don't trust the
  scraped table.
- **It is a loss + a dual-UNet base, not a lightweight engine.** ~6 s/A100 and dual UNets make
  it heavier per render than CatVTON. Its real value to TryIt is the **loss for training**, plus
  the **MIT checkpoint** as a commercial-safe fallback — not as the cheapest runtime path.

## Net

Two distinct wins: (1) **adopt the Leffa loss** when we train/fine-tune our own base for a
near-free fidelity gain; (2) keep the **MIT-licensed Leffa checkpoint** as the
**commercially-clear self-host/benchmark option** (and via fal.ai as a hosted option). It is
the license escape hatch the NC-licensed academic models don't give us.
