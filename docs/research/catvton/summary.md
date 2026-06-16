# CatVTON — Concatenation Is All You Need for Virtual Try-On with Diffusion Models

> Faithful structured summary. Sourced per claim; derived/unverified items flagged.

## Citation (exact)

- **Title:** "CatVTON: Concatenation Is All You Need for Virtual Try-On with Diffusion Models"
- **Authors:** Zheng Chong, Xiao Dong, Haoxiang Li, Shiyue Zhang, Wenqing Zhang, Xujie Zhang,
  Hanqing Zhao, Dongmei Jiang, Xiaodan Liang (arXiv author list is authoritative; one GitHub
  listing omits Dongmei Jiang)
- **Affiliation:** Sun Yat-sen University / Pengcheng Lab-affiliated group (Xiaodan Liang's
  group). *Flag: not confirmed verbatim from the fetched abstract/README.*
- **Year / venue:** submitted 21 Jul 2024; revised 16 Feb 2025; **ICLR 2025**
- **arXiv:** 2407.15886 (v2) — https://arxiv.org/abs/2407.15886
- **Code:** https://github.com/Zheng-Chong/CatVTON

## Problem

Diffusion try-on methods (IDM-VTON, OOTDiffusion, etc.) reach high fidelity but rely on a
**heavy second network** (ReferenceNet / image encoder / text-conditioned modules), inflating
parameters, memory, and latency. CatVTON asks whether all that is necessary.
Source: https://arxiv.org/abs/2407.15886

## Method

**Core idea:** concatenate the garment and person **along the spatial dimension** as the
diffusion input, so a single UNet attends across both with its native self-attention — no
ReferenceNet, no separate image encoder, no text encoder, **no warping**.
Source: https://www.emergentmind.com/papers/2407.15886

**Lightweight design (verified):**
- Removing the text encoder + cross-attention saves **167.02M params**.
- **Only the self-attention layers are trained: 49.57M trainable params** (~5.51% of total).
- Total params **899.06M** (VAE 83.61M + UNet 815.45M).
- At inference needs only person image + garment reference (no pose/parsing/captioning).
Source: https://github.com/Zheng-Chong/CatVTON · https://www.emergentmind.com/papers/2407.15886

**Base model:** **Stable Diffusion v1.5 inpainting.**
Source: https://github.com/Zheng-Chong/CatVTON

## Key equation

LDM objective (from paper appendix, verbatim symbolic form):

```
L_LDM := E[ || eps - eps_theta(z_t, t) ||_2^2 ]
```

(expectation over encoded images, noise, timesteps). Training also uses the **DREAM** strategy
with a balance parameter lambda. *Flag: full DREAM equation not reproduced here.*
Source: https://www.emergentmind.com/papers/2407.15886

## Datasets

- **VITON-HD** and **DressCode**; training uses ~73K samples from public datasets.
Source: https://github.com/Zheng-Chong/CatVTON · https://arxiv.org/abs/2407.15886

## Results

**VITON-HD, paired:** SSIM 0.8704 · FID 5.425 · KID 0.411 · LPIPS 0.0565
**VITON-HD, unpaired:** FID 9.015 · KID 1.091
**DressCode, unpaired:** FID 6.137 · KID 1.403
Reported to **beat IDM-VTON** on VITON-HD paired (IDM-VTON 5.76 FID / 0.0603 LPIPS vs CatVTON
5.43 / 0.0565). *Flag: paired numbers come from a secondary summary of the paper, not a
verbatim table read; DressCode paired SSIM/LPIPS and the full baseline grid not verified.*
Source: https://www.emergentmind.com/papers/2407.15886

## Compute (the key advantage)

- **VRAM:** README states **< 8 GB for 1024x768** (bf16); paper reports inference memory
  **3.276-5.940 GB** by resolution. Claims **>49% memory reduction** vs other diffusion try-on.
- **Latency:** **2.58 s @ 512x384 -> 9.25 s @ 1024x768.**
- Denoising step count not stated in fetched material. *Flag.*
Source: https://github.com/Zheng-Chong/CatVTON · https://www.emergentmind.com/papers/2407.15886

## License

- **Code/project: CC BY-NC-SA 4.0** — NonCommercial, ShareAlike, research-only.
- Builds on **SD 1.5**, so SD 1.5's **CreativeML OpenRAIL-M** use restrictions also apply
  upstream. *Flag: OpenRAIL inheritance is a correct legal inference, not a verbatim README
  clause.* Combined effect: **research/non-commercial only** as released.
Source: https://github.com/Zheng-Chong/CatVTON

## Limitations

- Same commercial blocker as the other academic models: **CC BY-NC-SA + SD1.5 OpenRAIL** =
  not deployable commercially as released.
- SD1.5 base caps top-end fidelity vs SDXL-based IDM-VTON, though metrics are competitive.
- Paired/baseline numbers partly from a secondary summary; verify against arXiv HTML tables
  (https://arxiv.org/html/2407.15886v2) before quoting as exact.

## Sourcing caveats

Affiliation, VITON-HD paired table, DressCode paired metrics, full baseline grid, denoising
steps, and the DREAM equation are unverified/derived and flagged above.
