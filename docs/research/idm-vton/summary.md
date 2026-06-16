# IDM-VTON — Improving Diffusion Models for Authentic Virtual Try-on in the Wild

> Faithful structured summary. Every factual claim is sourced. Where the literal text
> of a formula could not be captured glyph-for-glyph from the PDF, it is flagged.

## Citation (exact)

- **Title:** "Improving Diffusion Models for Authentic Virtual Try-on in the Wild"
- **Authors:** Yisol Choi, Sangkyung Kwak, Kyungmin Lee, Hyungwon Choi, Jinwoo Shin
- **Affiliation:** KAIST (Korea Advanced Institute of Science and Technology); OMNIOUS.AI
- **Year / venue:** 2024 preprint; **ECCV 2024**
- **arXiv:** 2403.05139 — https://arxiv.org/abs/2403.05139 (v1 8 Mar 2024; v3 29 Jul 2024)
- **Code / weights:** https://github.com/yisol/IDM-VTON · https://huggingface.co/yisol/IDM-VTON
- **Project page:** https://idm-vton.github.io/

## Problem

Image-based virtual try-on: render a person wearing a given garment, from a person image
plus an in-shop garment image. Prior exemplar-based diffusion (inpainting) models produce
natural-looking images but **fail to preserve garment identity** (logos, texture, structure),
and degrade further on "in the wild" inputs. IDM-VTON targets **high garment fidelity and
authenticity in the wild**.
Source: https://arxiv.org/abs/2403.05139

## Method

Base model: **SDXL inpainting** UNet ("TryonNet"). The HF model card tags
`StableDiffusionXLInpaintPipeline` / `stable-diffusion-xl`, confirming the SDXL base.
Source: https://arxiv.org/html/2403.05139v3 · https://huggingface.co/yisol/IDM-VTON

Garment is encoded through **two complementary paths**:

1. **High-level semantics (image-prompt path):** an **IP-Adapter**-style module on a
   **frozen OpenCLIP ViT-H/14 image encoder**; features fuse into the **cross-attention**
   layers of the base UNet to carry coarse garment semantics.
2. **Low-level detail (GarmentNet):** a **parallel UNet encoder** (pretrained SDXL UNet
   encoder) processes the garment. Its intermediate representation is **concatenated with
   TryonNet's along the sequence dimension; self-attention is computed over the concatenation,
   then only the TryonNet half is propagated forward** — the self-attention-concatenation
   injection that carries fine detail.

Detailed **text captions for both garment and person** improve authenticity. A **test-time
customization** step using a person-garment pair further sharpens fidelity.
Source: https://arxiv.org/html/2403.05139v3 · https://arxiv.org/abs/2403.05139

## Key equation

Standard diffusion (epsilon-prediction) objective. Rendered from arXiv HTML (symbolic form
faithful; **not** guaranteed glyph-perfect — PDF exceeded fetch size):

```
L_DM(theta) = E[ omega(t) * || eps_theta(x_t; c, t) - eps ||_2^2 ]
```

`eps` sampled noise, `eps_theta` prediction, `x_t` noised latent at step `t`, `c` conditioning
(garment features + captions), `omega(t)` per-step weight.
Source: https://arxiv.org/html/2403.05139v3

## Datasets

- **VITON-HD** — training used 11,647 pairs at 1024x768.
- **DressCode** — evaluation.
- **In-the-Wild set (authors' own):** 62 upper-garment images + 312 images of people wearing
  them (4-6 person images per garment), from MLB online shopping and Instagram.
Source: https://arxiv.org/html/2403.05139v3

## Results (paper's own Table 1)

| Test set   | LPIPS down | SSIM up | FID down | CLIP-I up |
| ---------- | ---------- | ------- | -------- | --------- |
| VITON-HD   | 0.102      | 0.870   | 6.29     | 0.883     |
| DressCode  | 0.062      | 0.920   | 8.64     | 0.904     |

Source: https://arxiv.org/html/2403.05139v3

**Caveats:**
- **KID is not surfaced in the main rendered table** — treat KID as *not captured*.
- Web searches surface higher FID (~20-23) from **third-party re-benchmarks** under different
  (often unpaired) protocols — do not attribute to this paper. Use 6.29 / 8.64.

## Compute

- Training: batch 24, LR 1e-5, 130 epochs, **4xA800**, ~40 h, 1024x768.
- Inference: DDPM scheduler, **30 steps**, 1024x768.
- **VRAM / model size / per-image latency: not published.** SDXL-scale, multi-UNet pipeline,
  needs a high-VRAM GPU. Replicate `cuuupid/idm-vton` reports **~18-19 s end-to-end on A100
  80GB** — an order-of-magnitude, not an official figure.
  Source: https://arxiv.org/html/2403.05139v3 · https://replicate.com/cuuupid/idm-vton

## License (commercial blocker)

- **Code + checkpoints: CC BY-NC-SA 4.0** (NonCommercial, ShareAlike) — GitHub + HF card. The
  **NC clause forbids commercial use** without separate permission.
- Built on **SDXL**; the upstream Stability AI / SDXL base license also applies (inferred from
  the dependency — the repo does not restate it verbatim).
- Repo acknowledges code from IP-Adapter, OOTDiffusion, DCI-VTON.
Source: https://github.com/yisol/IDM-VTON · https://huggingface.co/yisol/IDM-VTON

## Limitations

- Heavyweight (dual UNet + CLIP path on SDXL) -> high VRAM/latency; cost-prohibitive at high
  volume without aggressive caching.
- **CC BY-NC-SA blocks commercial self-hosting** of released weights as-is.
- KID not reported; equation transcribed from HTML, not the PDF.

## Sourcing caveats

KID metric, exact paired/unpaired labels, glyph-exact loss LaTeX, and official
VRAM/size/latency are unverified and flagged. StabilityAI license inheritance is a legal
inference, not a verbatim clause.
