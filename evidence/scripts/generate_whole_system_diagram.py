"""generate_whole_system_diagram — the end-to-end POST /v1/tryons request-flow schematic.

Renders the whole-system data flow faithfully from the API pipeline source
(apps/api/app/_lib/pipeline.ts): the eight ordered, fail-closed gates, the tenant-
namespaced cache short-circuit, the engine router with its provider fallthrough, and the
append-only audit log that records every allow/deny/error. Monochrome only.

Run from the evidence venv:
    evidence/.venv/Scripts/python evidence/scripts/generate_whole_system_diagram.py
"""
from __future__ import annotations

from pathlib import Path

from bw_diagram_toolkit import Box, Diagram, Edge, export

OUT = Path(__file__).resolve().parent.parent / "diagrams"


def build() -> Diagram:
    d = Diagram(width=1160, height=720, title="TryIt — POST /v1/tryons end-to-end request flow")

    # Shopper + edge.
    shopper = d.add_box(Box(40, 90, 150, 64, "Shopper", "uploads selfie", "pill"))
    sdk = d.add_box(Box(40, 200, 150, 64, "Widget / SDK", "<tryit-widget>", "solid"))
    route = d.add_box(Box(40, 320, 150, 70, "API route", "POST /v1/tryons", "emphasis"))

    d.add_edge(Edge(115, 154, 115, 200))
    d.add_edge(Edge(115, 264, 115, 320))

    # The fail-closed gate stack (steps 1-5), vertically, in pipeline order.
    gates = [
        ("1 · Auth", "verify bearer key + scope"),
        ("2 · Kill switch", "global / tenant halt"),
        ("3 · Image validate", "magic-bytes + dimensions"),
        ("4 · Rate limit", "per-shopper + per-tenant"),
        ("5 · Budget", "monthly USD cap"),
    ]
    gx, gw, gh = 290, 230, 58
    gate_boxes = []
    for i, (t, s) in enumerate(gates):
        gy = 90 + i * 86
        gate_boxes.append(d.add_box(Box(gx, gy, gw, gh, t, s, "solid")))

    # Route -> first gate, then gate-to-gate (deny falls out to the audit log on the right).
    d.add_edge(Edge(190, 355, gx, gate_boxes[0].y + gh / 2, "request"))
    for a, b in zip(gate_boxes, gate_boxes[1:]):
        d.add_edge(Edge(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, "pass"))

    # Cache (step 6).
    cache = d.add_box(Box(620, 150, 220, 70, "Tenant cache", "content-addressed key", "emphasis"))
    d.add_edge(Edge(gx + gw, gate_boxes[4].y + gh / 2, 620, 200, "all gates pass"))

    # Engine router (step 7) on a miss; provider fallthrough.
    router = d.add_box(Box(620, 300, 220, 70, "Engine router", "cheapest / priority first", "solid"))
    d.add_edge(Edge(730, 220, 730, 300, "MISS", "solid"))
    d.add_edge(Edge(840, 185, 1010, 185, "HIT", "dashed", curve=-30))

    providers = [
        ("fal (hosted)", "primary"),
        ("self-hosted", "inference-py"),
        ("deterministic", "terminal fallback"),
    ]
    pb = []
    for i, (t, s) in enumerate(providers):
        py = 300 + i * 86
        kind = "emphasis" if i == 2 else "solid"
        pb.append(d.add_box(Box(900, py, 220, 60, t, s, kind)))
    d.add_edge(Edge(840, 335, 900, pb[0].y + 30, "try"))
    for a, b in zip(pb, pb[1:]):
        d.add_edge(Edge(b.x + 20, a.y + a.h, b.x + 20, b.y, "on error/timeout", "dashed"))

    # Result + cache-put back.
    result = d.add_box(Box(620, 470, 220, 64, "Result image", "stamped: provider, latency", "solid"))
    d.add_edge(Edge(1010, pb[2].y + pb[2].h, 840, 502, "result", "solid", curve=60))
    d.add_edge(Edge(730, 470, 730, 220, "cache-put", "dashed", curve=0))
    d.add_edge(Edge(620, 502, 190, 360, "200 OK", "solid", curve=80))

    # Append-only audit log — every allow/deny/error path writes here.
    audit = d.add_box(Box(290, 560, 230, 70, "Audit log", "append-only · allow/deny/error", "emphasis"))
    for gb in gate_boxes:
        d.add_edge(Edge(gb.x, gb.y + gh / 2, 405, 560, "deny", "dashed", curve=20))
    d.add_edge(Edge(620, 505, 520, 590, "allow", "dashed", curve=20))

    d.add_note(40, 660, "Fail-closed: any gate that cannot verify refuses and writes a deny "
                        "event. Solid = primary path · dashed grey = fallthrough / async.")
    d.add_note(40, 685, "Source of truth: apps/api/app/_lib/pipeline.ts (runTryOn). "
                        "Tenant isolation enforced in the cache key + auth scope.")
    return d


def main() -> None:
    html, png = export(build(), OUT, "00_whole_system_request_flow")
    print(f"wrote {html.name} + {png.name}")


if __name__ == "__main__":
    main()
