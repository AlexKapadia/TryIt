# Virtual Try-On Method Space — Survey

> Comprehensive coverage of the full method space so our choice is informed, not
> single-family. Sourced per claim; unverified arXiv IDs flagged.

## Taxonomy anchor (citable)

- **Song et al., "Image-Based Virtual Try-On: A Survey," arXiv:2311.04811** (v4, 3 Sep 2024).
  Organizes the field by pipeline architecture, person representation, try-on indication,
  clothing warping, and try-on stage; explicitly contrasts **GAN-based vs diffusion-based**.
  https://arxiv.org/abs/2311.04811 · HTML: https://arxiv.org/html/2311.04811v4

The field's arc: **explicit-warp + generator (GAN era) -> implicit warp via attention
(diffusion era).**

## 1. Warping-based / explicit-flow (classical)

Defining trait: a separate geometric-matching/warping module deforms the in-shop garment to the
body, then a generator composites it.

- **VITON** (Han et al., arXiv:1711.08447, CVPR 2018): two-stage coarse-to-fine, **TPS
  warping**. https://arxiv.org/abs/1711.08447
- **CP-VTON** (Wang et al., arXiv:1807.07688, ECCV 2018): learned **Geometric Matching Module**
  regresses TPS params via CNN. https://arxiv.org/pdf/1807.07688
- **CP-VTON+** (CVPRW 2020): fixes person representation + mask handling. *Flag: workshop paper,
  no clean standalone arXiv id; cite via proceedings / the survey.*
- **ClothFlow** (ICCV 2019): replaces TPS with **per-pixel appearance flow** (dense
  correspondences). *Flag: ICCV-only, no widely indexed arXiv id.*
- **ACGPN** (Yang et al., arXiv:2003.05863, CVPR 2020): predicts semantic layout, adaptively
  generates vs preserves content, second-order TPS constraint. https://arxiv.org/abs/2003.05863

**Tradeoff (well-sourced):** TPS has limited degrees of freedom and "can only model limited
geometric changes," driving the move to appearance flow; explicit warping aligns texture but
produces artifacts under occlusion / large pose change and is multi-stage and brittle.
Source: https://arxiv.org/pdf/2204.01046 · https://arxiv.org/html/2311.04811v4

## 2. GAN-based generation (high-res, single forward pass)

Still explicit-warp, but the focus shifts to high-res GAN synthesis and warp-vs-body
misalignment.

- **VITON-HD** (Choi et al., arXiv:2103.16874, CVPR 2021): 1024x768, **ALIAS normalization**
  for misalignment. (See `viton-hd/`.) https://arxiv.org/abs/2103.16874
- **HR-VITON** (arXiv:2206.14180, ECCV 2022): warping + segmentation **simultaneously** to
  handle occlusion + misalignment. *Flag: id from search snippet, verify.*
- **GP-VTON** (CVPR 2023): **LFGP** local-flow/global-parsing warping + DGT training for hard
  poses. CVF open-access is primary; arXiv id unverified.

**Tradeoff (well-sourced):** single forward pass = fast inference, but training instability;
"as resolution increases, artifacts in the misaligned areas ... become noticeable"; GAN methods
"rely on an explicit warping process neglecting realistic garment folds and natural light and
shadow," and struggle with unconventional poses.
Source: https://arxiv.org/abs/2103.16874 · https://arxiv.org/html/2403.01779

## 3. Diffusion-based (current SOTA)

Paradigm shift: **implicit warping via (cross-)attention** instead of an explicit geometric
module. Best photorealism + garment fidelity + in-the-wild generalization; cost is multi-step
sampling latency.

- **TryOnDiffusion: A Tale of Two UNets** (Zhu et al., Google, arXiv:2306.08276, CVPR 2023):
  **Parallel-UNet**; garment warped *implicitly via cross-attention*; cascade 128->256->1024.
  https://arxiv.org/abs/2306.08276
- **LaDI-VTON** (arXiv:2305.13501, ACM MM 2023): first latent-diffusion VTON; textual inversion.
  https://arxiv.org/abs/2305.13501
- **DCI-VTON** (ACM MM 2023): appearance-flow warp + diffusion refiner. *Flag: id ~2308.06101,
  verify.*
- **StableVITON** (arXiv:2312.01725, CVPR 2024): zero-cross-attention block learns semantic
  correspondence on a frozen SD backbone. https://arxiv.org/abs/2312.01725
- **OOTDiffusion** (arXiv:2403.01779, AAAI 2025): outfitting UNet + self-attention fusion, no
  warping. (See `ootdiffusion/`.) https://arxiv.org/abs/2403.01779
- **IDM-VTON** (arXiv:2403.05139, ECCV 2024): dual-UNet (GarmentNet + denoising), high- +
  low-level conditioning; SDXL base; heavyweight. (See `idm-vton/`.) https://arxiv.org/abs/2403.05139
- **CatVTON** (arXiv:2407.15886, ICLR 2025): single lightweight UNet (~899M, ~49.6M trainable,
  <8 GB VRAM @1024x768) via **spatial concatenation**. (See `catvton/`.) https://arxiv.org/abs/2407.15886
- **Leffa** (arXiv:2412.08486, CVPR 2025): **attention-flow regularization loss**; MIT license.
  (See `leffa/`.) https://arxiv.org/abs/2412.08486

**Architecture split:** **dual-UNet** (separate reference/GarmentNet — IDM-VTON, Leffa) = higher
fidelity, higher cost; **single-UNet** (OOTDiffusion variants, CatVTON) = far lower
compute/memory.

**Tradeoff (well-sourced):** best photorealism and garment fidelity, generalize in-the-wild,
but "the necessity for multiple sampling steps ... limits real-time application."
Source: https://arxiv.org/abs/2311.18405

**Acceleration / few-step:** **CAT-DM** (arXiv:2311.18405, CVPR 2024) initializes the reverse
process from a pretrained GAN's distribution to **cut sampling steps** without quality loss.
https://arxiv.org/abs/2311.18405

## 4. Evaluation metrics (paired vs unpaired)

- **Paired (reconstruction; ground truth exists):** full-reference **SSIM** and **LPIPS** (plus
  FID/KID). 
- **Unpaired (garment swapped onto a different person; no ground truth):** distribution-level
  **FID** and **KID** only.
- **CLIP-based scores** for semantic/garment alignment.
- Quotable framing: "SSIM and LPIPS measure the similarity between two individual images, while
  FID and KID evaluate the similarity between two image distributions. In the paired setting,
  all four metrics are used, whereas in the unpaired setting, only FID and KID are applied."
Source: https://arxiv.org/html/2311.04811v4

Standard datasets: **VITON-HD** (1024x768) and **DressCode**.

## Implication for TryIt

The whole field has moved off GANs onto **warping-free diffusion**. Within diffusion, the
**single-UNet concatenation** family (CatVTON) is the cost/latency-optimal sub-branch, while
dual-UNet (IDM-VTON, Leffa) buys fidelity at higher cost. TryIt's quality bar should be set by
the diffusion leaders; its **runtime cost** is dominated by sampling steps -> caching and
few-step sampling (CAT-DM-style) are the levers. Metrics = SSIM/LPIPS (paired) + FID/KID
(unpaired) + CLIP, on a VITON-HD-anchored golden set.

## Flagged / verify before citing

CP-VTON+ (no arXiv id), ClothFlow (ICCV-only), HR-VITON (2206.14180), GP-VTON (CVF primary),
DCI-VTON (~2308.06101) — IDs from search, not direct fetch. All other IDs are confirmed via
arxiv.org pages.
