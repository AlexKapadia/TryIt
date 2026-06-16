"""benchmark_pipeline — MEASURED latency + MODELLED cost-at-scale evidence.

Two complementary artifacts, each PNG + interactive HTML, presented to a peer-reviewed
standard (percentiles, means +/- 95% bootstrap CIs, error bars):

  1. latency_distribution  — MEASURED. Runs measure_pipeline_latency.mjs against the REAL
     built TypeScript (deterministic provider + cache-key hashing) and plots the latency
     histogram with p50/p95/p99 markers and a percentile table with bootstrap CIs.

  2. cost_vs_cache_hit_rate — MODELLED. Uses the measured per-call cost assumptions to show
     how a content-addressed cache collapses provider spend as the hit-rate rises — the
     "millions of requests/day" argument. Clearly labelled MODELLED, with the formula stated.

Everything network-free and reproducible. Run from the evidence venv:
    evidence/.venv/Scripts/python evidence/scripts/benchmark_pipeline.py [--samples N]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import plotly.graph_objects as go

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = Path(__file__).resolve().parent.parent / "graphs"
DATA = Path(__file__).resolve().parent.parent / "data"
SAMPLER = Path(__file__).resolve().parent / "measure_pipeline_latency.mjs"

GREY = "#bdbdbd"
DARK = "#7a7a7a"
INK = "#1a1a1a"
plt.rcParams.update({"font.family": "DejaVu Sans", "axes.edgecolor": "#333",
                     "axes.linewidth": 0.8, "figure.dpi": 150})

# MODELLED cost assumptions (USD per non-cached provider call). Hosted virtual-try-on
# inference is the dominant marginal cost; the deterministic fallback and a cache hit are
# effectively free. These are illustrative planning figures, not a price quote.
HOSTED_CALL_USD = 0.05
CACHE_HIT_USD = 0.0


def run_sampler(samples: int) -> dict[str, np.ndarray]:
    """Invoke the Node sampler and collect per-op latency arrays (microseconds)."""
    proc = subprocess.run(
        ["node", str(SAMPLER), str(samples)],
        cwd=str(ROOT), capture_output=True, text=True, check=True,
    )
    by_op: dict[str, list[float]] = {}
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        by_op.setdefault(rec["op"], []).append(float(rec["us"]))
    sys.stderr.write(proc.stderr)
    return {op: np.asarray(v, dtype=float) for op, v in by_op.items()}


def bootstrap_ci(values: np.ndarray, stat, n_boot: int = 2000, seed: int = 7) -> tuple[float, float]:
    """95% bootstrap confidence interval for an arbitrary statistic of `values`."""
    rng = np.random.default_rng(seed)
    n = len(values)
    boots = np.empty(n_boot)
    for i in range(n_boot):
        sample = values[rng.integers(0, n, n)]
        boots[i] = stat(sample)
    return float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def summarise(values: np.ndarray) -> dict[str, float]:
    p50, p95, p99 = np.percentile(values, [50, 95, 99])
    mean = float(values.mean())
    lo, hi = bootstrap_ci(values, np.mean)
    return {
        "n": int(len(values)),
        "mean_us": mean, "mean_ci_lo": lo, "mean_ci_hi": hi,
        "p50_us": float(p50), "p95_us": float(p95), "p99_us": float(p99),
        "min_us": float(values.min()), "max_us": float(values.max()),
    }


def _latency_png(samples: dict[str, np.ndarray], stats: dict[str, dict]) -> None:
    ops = list(samples.keys())
    fig, axes = plt.subplots(1, len(ops), figsize=(12, 4.8), sharey=False)
    if len(ops) == 1:
        axes = [axes]
    for ax, op in zip(axes, ops):
        vals = samples[op]
        clip = np.percentile(vals, 99.5)  # trim the long tail for a readable histogram
        ax.hist(vals[vals <= clip], bins=60, color=GREY, edgecolor="#999", linewidth=0.4)
        s = stats[op]
        for q, ls, lab in ((s["p50_us"], "--", "p50"), (s["p95_us"], "-.", "p95"),
                           (s["p99_us"], ":", "p99")):
            ax.axvline(q, color=INK, linestyle=ls, linewidth=1.2,
                       label=f"{lab} {q:.1f}us")
        ax.set_title(op.replace("_", " "), fontsize=12, color=INK)
        ax.set_xlabel("latency (microseconds)")
        ax.set_ylabel("count")
        ax.spines[["top", "right"]].set_visible(False)
        ax.legend(frameon=False, fontsize=8)
    fig.suptitle("MEASURED per-operation latency (built TypeScript, network-free)",
                 fontsize=13, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(OUT / "latency_distribution.png", bbox_inches="tight")
    plt.close(fig)


def _latency_html(samples: dict[str, np.ndarray], stats: dict[str, dict]) -> None:
    fig = go.Figure()
    for op in samples:
        vals = samples[op]
        clip = np.percentile(vals, 99.5)
        fig.add_histogram(x=vals[vals <= clip], name=op.replace("_", " "),
                          opacity=0.7, nbinsx=60,
                          marker=dict(line=dict(color=INK, width=0.3)))
    rows = ["<b>MEASURED latency percentiles (microseconds), mean +/- 95% bootstrap CI</b>"]
    for op, s in stats.items():
        rows.append(
            f"{op}: n={s['n']}, mean={s['mean_us']:.2f} "
            f"[{s['mean_ci_lo']:.2f}, {s['mean_ci_hi']:.2f}], "
            f"p50={s['p50_us']:.2f}, p95={s['p95_us']:.2f}, p99={s['p99_us']:.2f}")
    fig.update_layout(
        title="MEASURED per-operation latency (built TypeScript, network-free)<br>"
              "<sup>" + " &nbsp;|&nbsp; ".join(rows[1:]) + "</sup>",
        barmode="overlay", template="plotly_white",
        xaxis_title="latency (microseconds)", yaxis_title="count",
        font=dict(family="Helvetica, Arial", color=INK), margin=dict(t=110))
    fig.write_html(OUT / "latency_distribution.html", include_plotlyjs="cdn", full_html=True)


def _cost_curve_data(daily_requests: int) -> tuple[np.ndarray, np.ndarray]:
    hit = np.linspace(0.0, 1.0, 101)
    # MODELLED: only cache MISSES incur a hosted provider call.
    cost_per_day = daily_requests * ((1 - hit) * HOSTED_CALL_USD + hit * CACHE_HIT_USD)
    return hit, cost_per_day


def _cost_png() -> None:
    fig, ax = plt.subplots(figsize=(10, 5.4))
    for n, style in ((1_000_000, "-"), (5_000_000, "--"), (10_000_000, ":")):
        hit, cost = _cost_curve_data(n)
        ax.plot(hit * 100, cost, style, color=INK, linewidth=1.6,
                label=f"{n/1e6:.0f}M requests/day")
    ax.set_xlabel("cache hit rate (%)")
    ax.set_ylabel("modelled provider spend (USD / day)")
    ax.set_title("MODELLED cost vs cache-hit-rate — caching collapses spend at scale",
                 fontsize=13, color=INK)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(color="#eee", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=9)
    ax.annotate(f"@ {HOSTED_CALL_USD:.2f} USD / hosted call;\ncache hit = free",
                xy=(0.02, 0.04), xycoords="axes fraction", fontsize=9, color=DARK)
    fig.tight_layout()
    fig.savefig(OUT / "cost_vs_cache_hit_rate.png", bbox_inches="tight")
    plt.close(fig)


def _cost_html() -> None:
    fig = go.Figure()
    for n in (1_000_000, 5_000_000, 10_000_000):
        hit, cost = _cost_curve_data(n)
        fig.add_scatter(x=hit * 100, y=cost, mode="lines", name=f"{n/1e6:.0f}M req/day",
                        line=dict(color=INK), hovertemplate="hit %{x:.0f}%<br>$%{y:,.0f}/day<extra></extra>")
    fig.update_layout(
        title="MODELLED cost vs cache-hit-rate — caching collapses spend at scale"
              f"<br><sup>@ ${HOSTED_CALL_USD:.2f}/hosted call, cache hit free</sup>",
        xaxis_title="cache hit rate (%)", yaxis_title="modelled provider spend (USD / day)",
        template="plotly_white", font=dict(family="Helvetica, Arial", color=INK),
        margin=dict(t=90))
    fig.write_html(OUT / "cost_vs_cache_hit_rate.html", include_plotlyjs="cdn", full_html=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=20000)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)

    samples = run_sampler(args.samples)
    stats = {op: summarise(v) for op, v in samples.items()}

    _latency_png(samples, stats)
    _latency_html(samples, stats)
    _cost_png()
    _cost_html()

    # Persist the headline metrics so the README and any reviewer can cite exact numbers.
    metrics = {
        "measured_latency_us": stats,
        "modelled_cost": {
            "hosted_call_usd": HOSTED_CALL_USD,
            "cache_hit_usd": CACHE_HIT_USD,
            "example_10M_per_day_at_80pct_hit_usd":
                10_000_000 * 0.2 * HOSTED_CALL_USD,
            "example_10M_per_day_at_0pct_hit_usd":
                10_000_000 * HOSTED_CALL_USD,
        },
    }
    (DATA / "benchmark_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    for op, s in stats.items():
        print(f"{op}: p50={s['p50_us']:.2f}us p95={s['p95_us']:.2f}us "
              f"p99={s['p99_us']:.2f}us mean={s['mean_us']:.2f}us (n={s['n']})")
    print("wrote latency_distribution.{png,html}, cost_vs_cache_hit_rate.{png,html}, "
          "data/benchmark_metrics.json")


if __name__ == "__main__":
    main()
