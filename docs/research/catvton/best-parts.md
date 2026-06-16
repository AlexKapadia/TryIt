# CatVTON — Best Parts to Take (for TryIt)

TryIt constraints: millions of try-on calls/day, low cost, low latency, apparel-first,
pluggable engine.

## What to adopt

1. **Concatenation-as-conditioning is the cheapest path to good try-on.** A single UNit with
   spatial concatenation removes the entire ReferenceNet/image-encoder/text-encoder stack.
   That is exactly the cost/latency profile TryIt needs: **<8 GB VRAM at 1024x768** and
   **~2.6 s at 512x384** make it deployable on commodity GPUs (even a single 16-24 GB card),
   so per-render GPU cost is a fraction of IDM-VTON's.

2. **Train only self-attention.** 49.57M trainable params (~5.5%) means **fast, cheap
   fine-tuning** on our own apparel data without a multi-GPU training cluster — the realistic
   path to a TryIt-tuned model.

3. **No pose/parsing/captioning required at inference.** Fewer preprocessing stages = fewer
   moving parts, lower tail latency, and a simpler service to operate at scale.

4. **It is the right self-host candidate to benchmark first** against our golden set (see
   `decision.md`): competitive quality (beats IDM-VTON on VITON-HD paired in the paper) at a
   fraction of the compute.

## What to watch / not adopt blindly

- **License is still the blocker.** CC BY-NC-SA 4.0 + SD1.5 OpenRAIL-M make the **released
  weights non-commercial**. To ship commercially we must (a) retrain the CatVTON *architecture*
  on commercially-clear data/base, or (b) call CatVTON only via a provider with commercial
  terms. The architecture/method is free to reimplement; the released checkpoint is not free
  to monetize.
- **SD1.5 base** caps top-end photorealism vs SDXL — acceptable for an apparel-first MVP, but
  measure on our golden set rather than assuming parity with IDM-VTON in the wild.

## Net

**CatVTON is TryIt's recommended self-hosted open-model base** on cost/latency/VRAM grounds:
the lightweight single-UNet concatenation design is the only one in this set that realistically
fits "millions of calls/day, low cost." We adopt the *architecture*; we do **not** ship the
non-commercial checkpoint as-is — we fine-tune/retrain for a commercially-clear deployment.
