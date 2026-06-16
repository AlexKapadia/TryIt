# VITON-HD — High-Resolution Virtual Try-On via Misalignment-Aware Normalization

> The GAN baseline. Faithful structured summary; sourced per claim.

## Citation (exact)

- **Title:** "VITON-HD: High-Resolution Virtual Try-On via Misalignment-Aware Normalization"
- **Authors:** Seunghwan Choi, Sunghyun Park, Minsoo Lee, Jaegul Choo
- **Year / venue:** **CVPR 2021**
- **arXiv:** 2103.16874 — https://arxiv.org/abs/2103.16874
- **Code:** https://github.com/shadow2496/VITON-HD

## Problem

Image-based virtual try-on at **high resolution (1024x768)**. As resolution rises, artifacts in
the **misaligned regions** between the warped clothing and the target body area become
conspicuous; prior methods could not synthesize clean high-res results.
Source: https://arxiv.org/abs/2103.16874

## Method (GAN pipeline)

1. **Segmentation generator** — predicts the target semantic segmentation of the person wearing
   the new clothes.
2. **Geometric matching module** — **TPS (thin-plate spline) warping** roughly fits the in-shop
   garment to the body.
3. **ALIAS generator + ALIAS normalization** — **ALIgnment-Aware Segment (ALIAS) normalization**
   handles the misaligned areas between warped clothes and the target region while preserving
   garment detail, producing the final 1024x768 image.
Source: https://arxiv.org/abs/2103.16874

**Loss terms:** the ALIAS generator is trained with a combination of **pixel (L1) loss,
perceptual / VGG feature loss, and a conditional adversarial (GAN) loss** — the standard
high-res image-synthesis recipe of this era. *Flag: the exact loss-term weights/formulas were
not captured verbatim (arXiv HTML render returned 404; abstract + repo do not enumerate them).
Treat the loss list as the field-standard set this paper uses, not a verbatim transcription.*
Source: https://arxiv.org/abs/2103.16874

## Dataset (introduced by this paper)

- **VITON-HD dataset:** frontal-view woman + top-clothing image pairs at **1024x768**, **for
  research only**. **11,647 training pairs + 2,032 test pairs (~13,679 total).** This dataset is
  the de-facto benchmark used by nearly every later diffusion method (IDM-VTON, CatVTON,
  OOTDiffusion, Leffa all train/evaluate on it).
Source: https://github.com/shadow2496/VITON-HD

## Results

The paper reports superiority over prior GAN methods (CP-VTON, ACGPN) on LPIPS, SSIM, FID, and
IS, qualitatively and quantitatively. *Flag: the README does not include the numeric table, and
the arXiv HTML render was unavailable (404); per-metric numbers were not captured verbatim from
a primary source. For exact figures see the paper PDF or the OOTDiffusion comparison table,
which lists VITON-HD at LPIPS 0.116 / SSIM 0.863 / FID 12.13 / KID 3.22 on its own 512x384
re-benchmark (https://arxiv.org/html/2403.01779).*
Source: https://arxiv.org/abs/2103.16874 · https://arxiv.org/html/2403.01779

## License

- **Code + dataset: Creative Commons BY-NC 4.0** — "use, redistribute, and adapt for
  **non-commercial** purposes." Dataset is **for research purposes only**.
Source: https://github.com/shadow2496/VITON-HD

## Why GAN-based try-on has been superseded by diffusion

GAN pipelines like VITON-HD do a **single fast forward pass** but rely on an **explicit warping
step**, so they: (a) produce visible artifacts in **misaligned** warp-vs-body regions as
resolution grows (the very problem ALIAS was built to patch); (b) struggle to render realistic
garment **folds, lighting, and high-frequency texture**; and (c) degrade on **complex /
unconventional poses**. Diffusion methods replace explicit warping with **implicit
attention-based alignment**, giving better photorealism and in-the-wild generalization — at the
cost of multi-step sampling latency.
Source: https://arxiv.org/abs/2103.16874 · https://arxiv.org/html/2403.01779 (OOTDiffusion's
discussion of GAN warping limitations) · survey https://arxiv.org/html/2311.04811v4

## Limitations (as a baseline today)

- Multi-stage and brittle (segmentation -> warp -> generate); errors compound across stages.
- Lower fidelity than diffusion on texture/pose; **non-commercial** code + dataset license.
- Its main lasting contribution is the **VITON-HD dataset/benchmark**, not the model.

## Sourcing caveats

Exact loss formulas and the per-metric results table were not captured verbatim (arXiv HTML
404); the loss list is the field-standard set and the numbers above are from a later
re-benchmark, both flagged. Dataset counts, license, method, and citation ARE verified.
