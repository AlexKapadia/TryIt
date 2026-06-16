# TryIt Research Library

Peer-reviewed / primary-source research grounding TryIt's virtual try-on engine. One folder per
paper (faithful `summary.md` with exact citations + `best-parts.md` on what TryIt should adopt),
plus cross-cutting survey, provider, and decision docs. Every factual claim is sourced; items
that could not be verified from a primary source are flagged in-place.

## Papers (one folder each)

| Folder | Paper | Year / venue | One-line takeaway |
| ------ | ----- | ------------ | ----------------- |
| [`idm-vton/`](./idm-vton/summary.md) | Improving Diffusion Models for Authentic Virtual Try-on in the Wild (Choi et al.) | 2024 / ECCV 2024 | Quality north star: SDXL dual-UNet two-path garment conditioning; **heavy + CC BY-NC-SA, not our runtime**. |
| [`catvton/`](./catvton/summary.md) | CatVTON: Concatenation Is All You Need (Chong et al.) | 2024 / ICLR 2025 | **Recommended self-host architecture** — single UNet via spatial concatenation, <8 GB VRAM, ~2.6 s; weights are NC, so retrain. |
| [`ootdiffusion/`](./ootdiffusion/summary.md) | OOTDiffusion: Outfitting Fusion based LDM (Xu et al.) | 2024 / AAAI 2025 | Take the **outfitting-dropout / CFG-over-garment-strength** idea; heavier than CatVTON, NC license. |
| [`leffa/`](./leffa/summary.md) | Leffa: Learning Flow Fields in Attention (Zhou et al., Meta) | 2024 / CVPR 2025 | **MIT-licensed** (code + weights) — the commercially-clear checkpoint; its **parameter-free loss** upgrades any base we train. |
| [`viton-hd/`](./viton-hd/summary.md) | VITON-HD: Misalignment-Aware Normalization (Choi et al.) | CVPR 2021 | GAN baseline; its **dataset is our golden-set backbone**; documents the misalignment failure mode that justifies warping-free diffusion. |

## Cross-cutting docs

| File | One-line takeaway |
| ---- | ----------------- |
| [`method-space-survey.md`](./method-space-survey.md) | Full taxonomy (warping -> GAN -> diffusion); the field is on warping-free diffusion; single-UNet = cheap, dual-UNet = high-fidelity; metrics = SSIM/LPIPS (paired) + FID/KID (unpaired) + CLIP. |
| [`provider-survey.md`](./provider-survey.md) | Hosted APIs compared: **fal.ai** = per-image, commercial-cleared, best default; **Replicate** = cheap per-run but non-commercial licenses; **Google Vertex** = GA API but throttled, price unverified; consumer Shopping try-on is not an API. |
| [`decision.md`](./decision.md) | **Pluggable engine, fal.ai hosted default, CatVTON-architecture self-host (Leffa MIT checkpoint to run today), content-addressed caching as primary cost lever, deterministic fail-closed fallback**; golden set = VITON-HD test + in-house apparel, metrics = SSIM/LPIPS/FID/KID/CLIP + latency + $/render. |

## Standing caveats

- Prices and latency in `provider-survey.md` are date-stamped **2026-06-16** and drift — re-verify live.
- Several metric tables / loss equations were read from arXiv HTML renders (PDFs exceeded fetch
  limits); these are flagged "verify before quoting as exact" in the relevant `summary.md`.
- Released academic weights (IDM-VTON, CatVTON, OOTDiffusion) are **CC BY-NC-SA + SD1.5/SDXL
  base licenses = non-commercial**. Only **Leffa is MIT**. Adopt architectures/ideas freely;
  do not monetize NC checkpoints as-is.
