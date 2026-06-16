# Leffa — Learning Flow Fields in Attention for Controllable Person Image Generation

> Faithful structured summary. Sourced per claim. Several numeric/equation items came from a
> single HTML-render read and are explicitly flagged "verify before quoting as exact."

## Citation (exact)

- **Title:** "Learning Flow Fields in Attention for Controllable Person Image Generation"
  ("Leffa" = **Le**arning **F**low **F**ields in **A**ttention; the acronym is not in the
  literal title).
- **Authors:** Zijian Zhou, Shikun Liu, Xiao Han, Haozhe Liu, Kam Woh Ng, Tian Xie, Yuren Cong,
  Hang Li, Mengmeng Xu, Juan-Manuel Perez-Rua, Aditya Patel, Tao Xiang, Miaojing Shi, Sen He.
- **Affiliations:** Meta AI; King's College London; Tongji University. *Flag: the specific Meta
  sub-org (FAIR vs Reality Labs) was not confirmed from a primary source.*
- **Year / venue:** 2024 preprint; **CVPR 2025** (accepted 26 Feb 2025).
- **arXiv:** 2412.08486 (v1 11 Dec 2024) — https://arxiv.org/abs/2412.08486
- **Code:** https://github.com/franciszzj/Leffa · https://huggingface.co/franciszzj/Leffa

## Problem

Controllable person image generation (virtual try-on = appearance control; pose transfer =
pose control). Diffusion baselines distort fine garment/identity detail because attention can
attend to the wrong reference region. Leffa adds explicit supervision so attention attends to
the correct region, **reducing detail distortion without adding parameters**.
Source: https://arxiv.org/abs/2412.08486

## Method (verified)

- A **training-time regularization loss ("Leffa loss")**, **not a new architecture**; adds
  **no trainable parameters**.
- **Model-agnostic:** authors state it "can be used to improve the performance of other
  diffusion models"; covers both virtual try-on and pose transfer.
- **Intuition:** attention maps are converted into **flow fields** (coordinate mappings) that
  warp the reference image toward the target; this gives explicit supervision that the target
  query attends to the correct reference key.
- **Baseline used:** built on **Stable Diffusion 1.5** with **dual UNets (Generative +
  Reference)** and spatially-concatenated self-attention. *Flag: SD1.5 + dual-UNet detail is
  single-source (HTML render); high-confidence but not cross-checked.*
Source: https://arxiv.org/abs/2412.08486 · https://arxiv.org/html/2412.08486v2

## Key equation (PARTIALLY verified)

Reported from the HTML render (symbols approximate; **not** captured glyph-for-glyph — PDF
exceeded fetch size):

```
L_leffa = sum_{l=1}^{L} || I_tgt . I_m  -  I_warp^l . I_m ||_2^2
```

L2 over selected attention layers `L`; `I_m` a mask; `I_warp^l` the reference warped by the
flow field derived from layer `l`'s attention. **Flag: verify against the PDF before citing.**
Source: https://arxiv.org/html/2412.08486v2

## Datasets

- **VITON-HD** and **DressCode** (try-on); **DeepFashion** (pose transfer).
Source: https://github.com/franciszzj/Leffa · https://huggingface.co/franciszzj/Leffa

## Results (SINGLE-SOURCE — verify before quoting as exact)

- **VITON-HD** paired/unpaired: FID 4.54 / 8.52; KID 0.05 / 0.32; LPIPS 0.048; SSIM 0.899
- **DressCode** paired/unpaired: FID 2.06 / 4.48; KID 0.07 / 0.62; LPIPS 0.031; SSIM 0.924
- **DeepFashion** (512x352): FID 4.23; LPIPS 0.119; SSIM 0.755

Paper claims SOTA on appearance + pose control. **Flag: numbers came only from the HTML-render
read; confirm against the PDF tables before treating as exact.**
Source: https://arxiv.org/html/2412.08486v2

## Compute

- **Latency:** float16 default, **~6 s per image on an A100** (official, as of 9 Jan 2025).
- **VRAM:** no official figure. Community (unofficial) forks list ~12 GB VRAM (try-on) /
  ~16 GB (pose transfer). *Flag: unofficial.*
Source: https://huggingface.co/franciszzj/Leffa · https://github.com/franciszzj/Leffa

## License (notable — permissive)

- **Code: MIT** (LICENSE + README + badge).
- **Weights (`franciszzj/Leffa` on HF): `license: mit`.** **No non-commercial / research-only
  restriction found.**
- **Correction to a common assumption:** despite Meta authorship, this is **NOT** a custom
  Meta/non-commercial license — it is permissive **MIT**, commercial use allowed per the
  published artifacts. The underlying **SD1.5** base-model license still applies separately.
Source: https://github.com/franciszzj/Leffa · https://huggingface.co/franciszzj/Leffa

## Limitations

- It is a **loss, not an engine** — value depends on retraining/fine-tuning a baseline with it;
  you do not "run Leffa" as a standalone fast inference path distinct from its dual-UNet base.
- Dual-UNet base (Generative + Reference) is heavier than CatVTON's single UNet; ~6 s/A100.
- Equation and metrics are single-source (HTML); SD1.5 base license still constrains the
  released checkpoint's base weights.

## Sourcing caveats

Meta sub-org, the loss equation glyphs, all metric numbers, and the SD1.5 + dual-UNet baseline
detail are single-source/unverified and flagged. The MIT license on code + weights IS verified.
