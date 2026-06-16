# OOTDiffusion — Best Parts to Take (for TryIt)

TryIt constraints: millions of try-on calls/day, low cost, low latency, apparel-first,
pluggable engine.

## What to adopt

1. **Outfitting dropout -> classifier-free guidance over garment strength.** This is the
   genuinely useful, portable idea: a single training-time dropout that lets us **dial garment
   conditioning strength at inference** with one scalar. For TryIt this is a cheap product lever
   (e.g. "tighter fit to the reference garment" vs "more natural drape") with no architecture
   change and no extra latency.

2. **Self-attention outfitting fusion (warping-free).** Confirms the field-wide lesson that
   explicit warping is unnecessary — fuse garment features in self-attention instead. Reinforces
   the CatVTON direction for our self-host base.

3. **Explicit half-body vs full-body / category split.** A clean operational pattern for an
   apparel-first catalogue: route tops/bottoms/dresses to category-aware handling. Worth
   mirroring in TryIt's request schema regardless of which engine renders.

4. **Strong, citable quality baselines.** Its per-metric tables (paper + Voost re-bench) are
   useful reference points for our golden-set scoring.

## What NOT to adopt

- **Not the self-host default.** A dedicated Outfitting UNet + CLIP encoder is **heavier than
  CatVTON** (which drops the second network entirely), with **no published VRAM/latency** to
  budget against. For "low cost, low latency at millions/day," CatVTON's single-UNet design
  wins.
- **Released weights are non-commercial** (CC BY-NC-SA + SD1.5 OpenRAIL) — same blocker as the
  others; not deployable commercially as-is.

## Net

Take the **outfitting-dropout / CFG-over-garment-strength idea** and the **category-routing
pattern**; do not adopt OOTDiffusion as the runtime engine — it is heavier than CatVTON without
a clear quality win for apparel, and carries the same non-commercial license.
