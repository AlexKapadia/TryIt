# IDM-VTON — Best Parts to Take (for TryIt)

TryIt constraints: millions of try-on calls/day, low cost, low latency, apparel-first,
pluggable engine.

## What to adopt

1. **The two-path garment-conditioning pattern (semantics + detail).** The split between a
   coarse CLIP/IP-Adapter "what garment is this" path and a fine GarmentNet "exact pixels"
   path is the strongest idea in the diffusion-VTON line and explains its garment-identity
   fidelity. If/when we train or fine-tune our own model, this dual-conditioning is the
   reference design for preserving logos and texture — the thing customers notice.

2. **Detailed garment captions as conditioning.** Cheap to generate (a captioner runs once per
   catalogue garment, then is cached forever) and measurably improves authenticity. Fits our
   apparel-first, catalogue-driven workload where each SKU is captioned once and reused across
   millions of renders.

3. **Quality bar / golden-set anchor.** IDM-VTON's VITON-HD numbers (LPIPS 0.102, SSIM 0.870,
   FID 6.29) are a credible high-quality target. Use them as a reference point when scoring
   candidate engines on our labelled apparel golden set.

## What NOT to adopt (and why)

- **Do not self-host the released IDM-VTON weights in production.** The **CC BY-NC-SA 4.0**
  license forbids commercial use; this is a hard legal blocker for a commercial product. If we
  want IDM-VTON quality commercially, we must either (a) call it via a hosted provider whose
  terms permit commercial use, or (b) license/retrain independently.
- **Do not make it the default self-host engine.** SDXL base + dual UNet + CLIP path = high
  VRAM and multi-step sampling (~18–19 s/image on A100 in third-party hosting). At millions of
  calls/day this is the most expensive, highest-latency option in the field — the opposite of
  our cost/latency constraint. CatVTON (single UNet, <8 GB) is the better self-host base.

## Net

IDM-VTON is the **quality north star and the architectural reference** for two-path garment
conditioning — not our runtime engine. License + compute rule it out as the self-hosted default;
its ideas inform what "good" looks like and how a future trained model should condition on
garments.
