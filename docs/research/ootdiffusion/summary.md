# OOTDiffusion — Outfitting Fusion based Latent Diffusion for Controllable Virtual Try-on

> Faithful structured summary. Sourced per claim; derived/unverified items flagged.

## Citation (exact)

- **Title:** "OOTDiffusion: Outfitting Fusion based Latent Diffusion for Controllable Virtual Try-on"
- **Authors:** Yuhao Xu, Tao Gu, Weifeng Chen, Chengcai Chen
- **Affiliation:** Xiao-i Research. *Flag: consistent across sources but not independently
  confirmed from the arXiv author-affiliation block.*
- **Year / venue:** 2024 preprint; **AAAI 2025**
- **arXiv:** 2403.01779 — https://arxiv.org/abs/2403.01779
- **Code:** https://github.com/levihsu/OOTDiffusion · https://huggingface.co/levihsu/OOTDiffusion

## Problem

Controllable, warping-free image-based try-on with strong garment-detail preservation, while
allowing the strength of garment conditioning to be tuned at inference.
Source: https://arxiv.org/abs/2403.01779

## Method

Base: **latent diffusion, Stable Diffusion v1.5.**
- **Outfitting UNet:** a dedicated UNet that learns garment detail features.
- **Outfitting fusion:** garment features are aligned to the body by fusing them **inside the
  self-attention layers** of the denoising UNet — **no explicit warping** (single-network).
- **Outfitting dropout:** applied in training to enable **classifier-free guidance**, so the
  garment-feature strength / controllability is adjustable at inference.
- **Half-body** model trained on VITON-HD; **full-body** model trained on DressCode with 3
  categories (upper 0, lower 1, dresses 2).
Source: https://arxiv.org/abs/2403.01779 · https://github.com/levihsu/OOTDiffusion

## Key equation (verbatim from paper)

```
L_OOTD = E[ || eps - eps_theta( z_t, t, omega_theta'(E(g), psi), psi ) ||_2^2 ]
```

where `E(g)` is the encoded garment, `omega_theta'` the outfitting UNet, `psi` the
conditioning — a standard epsilon-prediction LDM loss with outfitting-UNet feature injection.
Source: https://arxiv.org/html/2403.01779

## Datasets

- **VITON-HD** (half-body) and **DressCode** (full-body). Trained at 512x384 and 1024x768.
Source: https://arxiv.org/abs/2403.01779 · https://github.com/levihsu/OOTDiffusion

## Results (paper tables, 512x384)

**VITON-HD** (LPIPS/FID/KID down, SSIM up):

| Method        | LPIPS | SSIM  | FID   | KID  |
| ------------- | ----- | ----- | ----- | ---- |
| VITON-HD      | 0.116 | 0.863 | 12.13 | 3.22 |
| HR-VITON      | 0.097 | 0.878 | 12.30 | 3.82 |
| LaDI-VTON     | 0.091 | 0.875 | 9.31  | 1.53 |
| GP-VTON       | 0.083 | 0.892 | 9.17  | 0.93 |
| StableVITON   | 0.084 | 0.862 | 9.13  | 1.20 |
| **OOTDiffusion** | **0.071** | **0.878** | **8.81** | **0.82** |

**DressCode** (512x384):

| Method        | LPIPS | SSIM  | FID   | KID  |
| ------------- | ----- | ----- | ----- | ---- |
| Paint-by-Example | 0.142 | 0.851 | 9.57  | 3.63 |
| LaDI-VTON     | 0.067 | 0.910 | 5.66  | 1.21 |
| GP-VTON       | 0.051 | 0.921 | 5.88  | 1.28 |
| **OOTDiffusion** | **0.045** | **0.927** | **4.20** | **0.37** |

Source: https://arxiv.org/html/2403.01779

**Caveat:** these are the **paper's own** numbers. Third-party re-benchmarks (e.g. the Voost
paper, https://arxiv.org/pdf/2508.04825) report different OOTDiffusion figures under their own
protocols (VITON-HD paired SSIM 0.851 / LPIPS 0.096 / FID 6.520 / KID 0.896; unpaired FID
9.672 / KID 1.206). Protocols differ; paper vs re-bench numbers are not directly comparable.

## Compute

- **VRAM / model size / latency: not documented** in the paper, README, or HF card. Demo runs
  on A100 (ZeroGPU); needs `clip-vit-large-patch14`; ONNX human parsing. *Flag: all unverified.*
Source: https://github.com/levihsu/OOTDiffusion · https://huggingface.co/levihsu/OOTDiffusion

## License

- **CC BY-NC-SA 4.0** (NonCommercial, ShareAlike) — GitHub LICENSE + HF card.
- Built on SD v1.5, whose **CreativeML OpenRAIL-M** restrictions apply upstream. *Flag:
  OpenRAIL inheritance is inferred, not in OOTDiffusion's LICENSE file.*
Source: https://raw.githubusercontent.com/levihsu/OOTDiffusion/main/LICENSE · https://huggingface.co/levihsu/OOTDiffusion

## Limitations

- **CC BY-NC-SA + SD1.5 OpenRAIL** => non-commercial as released.
- No published VRAM/latency; a separate Outfitting UNet + CLIP encoder is heavier than
  CatVTON's single-UNet concatenation, so expect higher cost than CatVTON though lighter
  than IDM-VTON's SDXL stack.
- DCI-VTON is absent from the paper's comparison tables.

## Sourcing caveats

Affiliation, OpenRAIL inheritance, and all compute figures are unverified/derived and flagged.
