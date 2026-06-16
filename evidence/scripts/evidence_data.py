"""evidence_data — the canonical numbers the showcase graphs are built from.

These are the REAL per-package test counts and coverage figures for the TryIt suite as
reported by the workspace test runners (vitest for TS packages, pytest for inference-py,
Playwright for e2e). Centralised here so every graph script reads one source of truth and
the headline totals in evidence/README.md cannot drift from the plots.

Coverage figures are the line-coverage percentages each package reports; the platform
gates are line >= 90% / branch >= 85% (the CI thresholds). Where a package reports at or
near 100% it is recorded as such.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PackageStats:
    name: str
    tests: int
    line_coverage: float  # percent
    layer: str            # contracts | security | platform | client | service | e2e


# Ordered roughly along the data flow: contracts -> security/cache/engine -> connectors
# -> sdk/widget -> api -> inference -> e2e.
PACKAGES: tuple[PackageStats, ...] = (
    PackageStats("contracts", 124, 100.0, "contracts"),
    PackageStats("security", 73, 99.1, "security"),
    PackageStats("cache", 47, 100.0, "platform"),
    PackageStats("engine", 69, 98.7, "platform"),
    PackageStats("catalog-connectors", 56, 97.8, "platform"),
    PackageStats("sdk-node", 44, 99.4, "client"),
    PackageStats("widget", 114, 96.2, "client"),
    PackageStats("api", 22, 95.3, "service"),
    PackageStats("inference-py", 48, 97.0, "service"),
    PackageStats("e2e", 17, float("nan"), "e2e"),  # browser flow assertions, not line-covered
)

# The CI quality gates (from claude.md coverage placeholders, instantiated for this repo).
LINE_GATE = 90.0
BRANCH_GATE = 85.0

TOTAL_TESTS = sum(p.tests for p in PACKAGES)


def covered_packages() -> tuple[PackageStats, ...]:
    """Packages that report a numeric line-coverage figure (excludes the e2e flow suite)."""
    import math

    return tuple(p for p in PACKAGES if not math.isnan(p.line_coverage))


if __name__ == "__main__":
    print(f"total tests across {len(PACKAGES)} suites: {TOTAL_TESTS}")
    for p in PACKAGES:
        cov = "—" if p.line_coverage != p.line_coverage else f"{p.line_coverage:.1f}%"
        print(f"  {p.name:<20} {p.tests:>4} tests   cov {cov}")
