"""generate_component_diagrams — per-component black-&-white schematics for the showcase.

One diagram per major component, each grounded in its source package:
  1 security gate        packages/security  (auth, rate-limit, image-validation, audit)
  2 cache                packages/cache     (content-addressed, tenant-namespaced key)
  3 engine + providers   packages/engine    (router fallthrough + provider lineup)
  4 catalog connectors   packages/catalog-connectors (Shopify / REST -> normalized product)
  5 widget               packages/widget    (state machine of the embeddable Web Component)
  6 inference-py         services/inference-py (FastAPI backend selection, fail-closed)

Monochrome only. Run from the evidence venv:
    evidence/.venv/Scripts/python evidence/scripts/generate_component_diagrams.py
"""
from __future__ import annotations

from pathlib import Path

from bw_diagram_toolkit import Box, Diagram, Edge, export

OUT = Path(__file__).resolve().parent.parent / "diagrams"


def _vstack(d: Diagram, items, x, w=250, h=58, top=80, gap=84, kind="solid"):
    boxes = []
    for i, (t, s) in enumerate(items):
        boxes.append(d.add_box(Box(x, top + i * gap, w, h, t, s, kind)))
    return boxes


def security_gate() -> Diagram:
    d = Diagram(940, 560, "Security gate — packages/security")
    inp = d.add_box(Box(40, 240, 170, 70, "Untrusted request", "bearer + image", "dashed"))
    gates = _vstack(d, [
        ("api-key-auth", "constant-time verify · scope · tenant"),
        ("rate-limit", "per-shopper + per-tenant window"),
        ("image-validation", "magic-bytes · dimensions · size"),
    ], x=300, w=300, top=90, gap=110)
    d.add_edge(Edge(210, 275, 300, gates[0].y + 35, "deny by default"))
    for a, b in zip(gates, gates[1:]):
        d.add_edge(Edge(a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y, "pass"))
    ok = d.add_box(Box(680, 130, 200, 64, "Admit", "to cache / engine", "emphasis"))
    audit = d.add_box(Box(680, 320, 200, 70, "audit-log", "append-only · what/when/who", "emphasis"))
    d.add_edge(Edge(600, gates[0].y + 35, 680, 162, "ok"))
    for g in gates:
        d.add_edge(Edge(g.x + g.w, g.y + 40, 680, 350, "deny -> event", "dashed", curve=20))
    d.add_note(40, 470, "Every gate fails closed: a missing/ambiguous check refuses. The "
                        "actor logged is the shopper id — never the API key (no secret in the trail).")
    return d


def cache() -> Diagram:
    d = Diagram(960, 520, "Cache — packages/cache (tenant-namespaced, content-addressed)")
    parts = _vstack(d, [
        ("tenantId", "isolation namespace (T1)"),
        ("personImageHash", "SHA-256 of image bytes"),
        ("productId", "apparel item"),
        ("params", "canonical (sorted-key) JSON"),
    ], x=40, w=270, top=90, gap=80, kind="solid")
    mix = d.add_box(Box(400, 200, 230, 80, "length-prefixed\nSHA-256", "domain-separated digest", "emphasis"))
    for p in parts:
        d.add_edge(Edge(p.x + p.w, p.y + 29, 400, 240, "", "solid"))
    key = d.add_box(Box(720, 120, 200, 70, "Cache key", "<tenant>:<sha256hex>", "emphasis"))
    store = d.add_box(Box(720, 300, 200, 70, "result-cache", "getOrCompute: hit / miss"))
    d.add_edge(Edge(630, 230, 720, 155, "prefix + digest"))
    d.add_edge(Edge(820, 190, 820, 300, "lookup"))
    d.add_note(40, 440, "Two tenants can NEVER collide: tenantId is folded into the hashed "
                        "material AND used as a literal key prefix. Length-prefixing blocks "
                        "boundary-shift collisions. Compute fn runs exactly once on a miss.")
    return d


def engine() -> Diagram:
    d = Diagram(1000, 560, "Engine — packages/engine (router fallthrough)")
    req = d.add_box(Box(40, 230, 160, 70, "TryOnRequest", "+ TenantConfig", "dashed"))
    order = d.add_box(Box(260, 230, 220, 70, "order candidates", "allow-list · priority · cost", "emphasis"))
    d.add_edge(Edge(200, 265, 260, 265))
    provs = _vstack(d, [
        ("fal", "hosted · primary"),
        ("replicate", "hosted"),
        ("google-vto", "hosted"),
        ("self-hosted", "inference-py"),
        ("deterministic", "terminal · never fails"),
    ], x=560, w=240, top=70, gap=86)
    d.add_edge(Edge(480, 265, 560, provs[0].y + 29, "try cheapest"))
    for a, b in zip(provs, provs[1:]):
        d.add_edge(Edge(a.x + 30, a.y + a.h, b.x + 30, b.y, "error/timeout", "dashed"))
    d.add_note(40, 480, "Each provider re-validated before use. The deterministic provider is "
                        "the guaranteed last resort, so the engine answers fail-closed and never "
                        "hard-errors unless even the fallback is excluded.")
    return d


def connectors() -> Diagram:
    d = Diagram(960, 480, "Catalog connectors — packages/catalog-connectors")
    sources = _vstack(d, [
        ("Shopify Admin", "{products:[...]} + Link cursor"),
        ("Generic REST", "arbitrary JSON shape"),
    ], x=40, w=260, top=110, gap=120, kind="dashed")
    schema = d.add_box(Box(390, 150, 240, 100, "NormalizedProduct\nschema (zod)", "HTTPS images only · fail-closed", "emphasis"))
    for s in sources:
        d.add_edge(Edge(s.x + s.w, s.y + 29, 390, 200, "map -> parse"))
    out = d.add_box(Box(720, 90, 200, 64, "NormalizedProduct", "one contract", "solid"))
    skip = d.add_box(Box(720, 250, 200, 64, "SkippedProduct", "ref + reason", "solid"))
    d.add_edge(Edge(630, 185, 720, 122, "valid"))
    d.add_edge(Edge(630, 215, 720, 282, "malformed", "dashed"))
    d.add_note(40, 420, "Upstream catalog data is untrusted: parsed at the boundary, non-HTTPS "
                        "images and malformed items are dropped (never throw). Injected fetch — "
                        "no network in the unit suite.")
    return d


def widget() -> Diagram:
    d = Diagram(1020, 420, "Widget — packages/widget (state machine)")
    states = [
        ("idle", "awaiting photo"),
        ("staged", "photo validated"),
        ("submitting", "POST /v1/tryons"),
        ("polling", "GET /v1/tryons/:id"),
        ("done", "result rendered"),
    ]
    boxes = []
    for i, (t, s) in enumerate(states):
        boxes.append(d.add_box(Box(40 + i * 195, 150, 165, 70, t, s,
                                   "emphasis" if t in ("idle", "done") else "solid")))
    for a, b in zip(boxes, boxes[1:]):
        d.add_edge(Edge(a.x + a.w, a.y + 35, b.x, b.y + 35))
    err = d.add_box(Box(430, 300, 200, 64, "error", "typed copy per ErrorCode", "dashed"))
    d.add_edge(Edge(boxes[2].x + 80, boxes[2].y + 70, 520, 300, "fail", "dashed"))
    d.add_edge(Edge(boxes[3].x + 80, boxes[3].y + 70, 540, 300, "fail", "dashed"))
    d.add_note(40, 350, "Framework-free Web Component <tryit-widget>. Every transition is a pure "
                        "reducer; every error maps to human copy (error-copy.ts). No dead controls.")
    return d


def inference() -> Diagram:
    d = Diagram(960, 480, "Inference service — services/inference-py (FastAPI)")
    req = d.add_box(Box(40, 200, 170, 70, "POST /infer", "person + garment", "dashed"))
    val = d.add_box(Box(280, 200, 210, 70, "schema validate", "fail-closed on bad input", "emphasis"))
    d.add_edge(Edge(210, 235, 280, 235))
    factory = d.add_box(Box(560, 90, 200, 64, "backend factory", "env-selected"))
    leffa = d.add_box(Box(560, 220, 200, 60, "Leffa backend", "real model"))
    mock = d.add_box(Box(560, 330, 200, 60, "Mock backend", "deterministic · CI", "emphasis"))
    d.add_edge(Edge(490, 235, 560, 122, "route"))
    d.add_edge(Edge(660, 154, 660, 220, "MODEL"))
    d.add_edge(Edge(660, 154, 660, 330, "MOCK", "dashed", curve=0))
    d.add_note(40, 420, "Backend chosen from config/env. Mock backend is byte-deterministic for "
                        "tests and offline CI; validation refuses malformed payloads before any model runs.")
    return d


BUILDERS = [
    ("01_security_gate", security_gate),
    ("02_cache_key_derivation", cache),
    ("03_engine_provider_fallthrough", engine),
    ("04_catalog_connectors", connectors),
    ("05_widget_state_machine", widget),
    ("06_inference_py_backend_selection", inference),
]


def main() -> None:
    for stem, fn in BUILDERS:
        html, png = export(fn(), OUT, stem)
        print(f"wrote {html.name} + {png.name}")


if __name__ == "__main__":
    main()
