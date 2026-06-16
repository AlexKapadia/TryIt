"""generate_suite_graphs — "the suite is the evidence": test-count and coverage charts.

Produces, as BOTH a static PNG (matplotlib) and an interactive HTML (plotly):
  * test_counts_per_package  — bar of tests per package + the 755 total annotated.
  * coverage_per_package     — bar of line coverage per package with the 90/85 gate lines.

Monochrome/greyscale to match the diagram set. Run from the evidence venv:
    evidence/.venv/Scripts/python evidence/scripts/generate_suite_graphs.py
"""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.graph_objects as go

from evidence_data import (
    BRANCH_GATE,
    LINE_GATE,
    PACKAGES,
    TOTAL_TESTS,
    covered_packages,
)

OUT = Path(__file__).resolve().parent.parent / "graphs"
GREY = "#bdbdbd"
INK = "#1a1a1a"
plt.rcParams.update({"font.family": "DejaVu Sans", "axes.edgecolor": "#333",
                     "axes.linewidth": 0.8, "figure.dpi": 150})


def _test_counts_png() -> None:
    names = [p.name for p in PACKAGES]
    counts = [p.tests for p in PACKAGES]
    fig, ax = plt.subplots(figsize=(11, 5.2))
    bars = ax.bar(names, counts, color=GREY, edgecolor=INK, linewidth=1.0)
    for b, c in zip(bars, counts):
        ax.text(b.get_x() + b.get_width() / 2, c + 2, str(c), ha="center",
                va="bottom", fontsize=9, color=INK)
    ax.set_ylabel("automated tests")
    ax.set_title(f"TryIt test suite — {TOTAL_TESTS} automated tests across "
                 f"{len(PACKAGES)} packages", fontsize=13, color=INK)
    ax.set_ylim(0, max(counts) * 1.18)
    ax.spines[["top", "right"]].set_visible(False)
    plt.xticks(rotation=30, ha="right", fontsize=9)
    ax.grid(axis="y", color="#eee", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "test_counts_per_package.png", bbox_inches="tight")
    plt.close(fig)


def _test_counts_html() -> None:
    names = [p.name for p in PACKAGES]
    counts = [p.tests for p in PACKAGES]
    fig = go.Figure(go.Bar(
        x=names, y=counts, text=counts, textposition="outside",
        marker=dict(color=GREY, line=dict(color=INK, width=1.2)),
        hovertemplate="%{x}<br>%{y} tests<extra></extra>"))
    fig.update_layout(
        title=f"TryIt test suite — {TOTAL_TESTS} automated tests across {len(PACKAGES)} packages",
        yaxis_title="automated tests", template="plotly_white",
        font=dict(family="Helvetica, Arial", color=INK), bargap=0.35,
        margin=dict(t=70, b=110))
    fig.write_html(OUT / "test_counts_per_package.html", include_plotlyjs="cdn",
                   full_html=True)


def _coverage_png() -> None:
    pkgs = covered_packages()
    names = [p.name for p in pkgs]
    cov = [p.line_coverage for p in pkgs]
    fig, ax = plt.subplots(figsize=(11, 5.2))
    bars = ax.bar(names, cov, color=GREY, edgecolor=INK, linewidth=1.0)
    for b, c in zip(bars, cov):
        ax.text(b.get_x() + b.get_width() / 2, c + 0.15, f"{c:.1f}", ha="center",
                va="bottom", fontsize=9, color=INK)
    ax.axhline(LINE_GATE, color=INK, linestyle="--", linewidth=1.3,
               label=f"line gate {LINE_GATE:.0f}%")
    ax.axhline(BRANCH_GATE, color="#666", linestyle=":", linewidth=1.3,
               label=f"branch gate {BRANCH_GATE:.0f}%")
    ax.set_ylabel("line coverage (%)")
    ax.set_title("Line coverage per package vs CI gates (all pass)", fontsize=13, color=INK)
    ax.set_ylim(80, 102)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=9, loc="lower right")
    plt.xticks(rotation=30, ha="right", fontsize=9)
    ax.grid(axis="y", color="#eee", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(OUT / "coverage_per_package.png", bbox_inches="tight")
    plt.close(fig)


def _coverage_html() -> None:
    pkgs = covered_packages()
    names = [p.name for p in pkgs]
    cov = [p.line_coverage for p in pkgs]
    fig = go.Figure()
    fig.add_bar(x=names, y=cov, text=[f"{c:.1f}%" for c in cov], textposition="outside",
                marker=dict(color=GREY, line=dict(color=INK, width=1.2)),
                hovertemplate="%{x}<br>%{y:.1f}% line coverage<extra></extra>")
    fig.add_hline(y=LINE_GATE, line=dict(color=INK, dash="dash"),
                  annotation_text=f"line gate {LINE_GATE:.0f}%", annotation_position="top left")
    fig.add_hline(y=BRANCH_GATE, line=dict(color="#666", dash="dot"),
                  annotation_text=f"branch gate {BRANCH_GATE:.0f}%",
                  annotation_position="bottom left")
    fig.update_layout(
        title="Line coverage per package vs CI gates (all pass)",
        yaxis=dict(title="line coverage (%)", range=[80, 102]),
        template="plotly_white", font=dict(family="Helvetica, Arial", color=INK),
        bargap=0.35, margin=dict(t=70, b=110))
    fig.write_html(OUT / "coverage_per_package.html", include_plotlyjs="cdn", full_html=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    _test_counts_png()
    _test_counts_html()
    _coverage_png()
    _coverage_html()
    print("wrote test_counts_per_package.{png,html} + coverage_per_package.{png,html}")


if __name__ == "__main__":
    main()
