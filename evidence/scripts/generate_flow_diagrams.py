"""Regenerate the TryIt evidence flow diagrams (00..06) as clean, monochrome,
auto-laid-out schematics.

Renderer: Graphviz `dot` (auto-layout — guarantees no overlapping boxes/edges).
Each diagram is authored as a DOT graph here, then rendered to:
  - <name>.svg   (vector, embedded in the HTML artifact)
  - <name>.png   (high-res, -Gdpi=150)
  - <name>.html  (minimal wrapper embedding the SVG inline)

Design language (institution-grade B/W):
  - bgcolor=white, black nodes/edges/text, Helvetica.
  - White / very-light-grey (#f4f4f4) node fills only. No colour.
  - splines=ortho or polyline, generous nodesep/ranksep so labels never collide.

All content is ACCURATE to the current code (read 2026-06-16):
  apps/api/app/_lib/{pipeline,pipeline-execute,job-access}.ts,
  packages/cache/src/cache-key.ts, packages/engine/src/router.ts,
  packages/catalog/*, packages/widget/src/state.ts,
  services/inference-py/app/factory.py.

Run:  python evidence/scripts/generate_flow_diagrams.py
Requires the Graphviz `dot` binary on PATH (or set GRAPHVIZ_BIN).
"""

from __future__ import annotations

import html
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIAGRAMS_DIR = HERE.parent / "diagrams"

# ---------------------------------------------------------------------------
# Shared DOT styling — one place so every diagram looks identical.
# ---------------------------------------------------------------------------
FONT = "Helvetica"
GRAPH_ATTRS = (
    f'  bgcolor="white";\n'
    f'  fontname="{FONT}";\n'
    f'  labelloc="t";\n'
    f'  fontsize=18;\n'
    f'  fontcolor="#111111";\n'
    f'  pad="0.35";\n'
    f'  nodesep=0.55;\n'
    f'  ranksep=0.75;\n'
)
NODE_DEFAULTS = (
    f'  node [shape=box style="rounded,filled" fillcolor="white" '
    f'color="#111111" fontcolor="#111111" fontname="{FONT}" fontsize=12 '
    f'penwidth=1.4 margin="0.20,0.12"];\n'
)
EDGE_DEFAULTS = (
    f'  edge [color="#111111" fontcolor="#444444" fontname="{FONT}" '
    f'fontsize=10 penwidth=1.3 arrowsize=0.8];\n'
)

# Reusable node-style fragments (all monochrome).
EMPHASIS = 'fillcolor="#f4f4f4" penwidth=2.4'          # terminal / important nodes
DASHED = 'style="rounded,dashed,filled" fillcolor="white"'  # untrusted / external
DENY = 'fillcolor="#ececec" penwidth=1.2 fontcolor="#444444"'  # deny / error sink
DENY_EDGE = 'color="#777777" fontcolor="#777777" style=dashed'


def _diagram(title: str, rankdir: str, body: str, splines: str = "polyline") -> str:
    return (
        "digraph G {\n"
        f'  rankdir={rankdir};\n'
        f'  splines={splines};\n'
        f'  label="{title}";\n'
        f"{GRAPH_ATTRS}"
        f"{NODE_DEFAULTS}"
        f"{EDGE_DEFAULTS}"
        f"{body}"
        "}\n"
    )


# ---------------------------------------------------------------------------
# 00 — Whole system request flow
# ---------------------------------------------------------------------------
def d00() -> str:
    body = r'''
  shopper [label="Shopper widget\n(packages/widget)" style="rounded,dashed,filled" fillcolor="white"];

  subgraph cluster_post {
    label="POST /v1/tryons   (Bearer auth)";
    fontname="Helvetica"; fontsize=12; fontcolor="#444444"; color="#cccccc"; style="rounded";

    gate   [label="SECURITY GATE\n(fail-closed, ordered)" fillcolor="#f4f4f4" penwidth=2.4];
    idem   [label="Idempotency check\n(tenant-scoped replay)"];
    cache  [label="Tenant-namespaced CACHE\ngetOrCompute(keyParts)"];
    router [label="ENGINE router\n(cost / priority order)"];
    audit  [label="Append-only AUDIT\nallow / deny / error" fillcolor="#f4f4f4" penwidth=2.4];
    result [label="Result\n{ jobId, succeeded, result }" fillcolor="#f4f4f4" penwidth=2.4];
  }

  subgraph cluster_prov {
    label="Providers (terminal fallback guaranteed)";
    fontname="Helvetica"; fontsize=12; fontcolor="#444444"; color="#cccccc"; style="rounded";
    rank=same;
    fal    [label="fal"];
    self   [label="self-hosted"];
    det    [label="deterministic\nfallback" fillcolor="#f4f4f4" penwidth=2.0];
  }

  poll   [label="GET /v1/tryons/:id\nBearer auth + tenant-scoped\n(404 on miss / wrong tenant)" style="rounded,dashed,filled" fillcolor="white"];

  shopper -> gate;
  gate   -> idem    [label="pass"];
  gate   -> audit   [label="deny" color="#777777" fontcolor="#777777" style=dashed];
  idem   -> result  [label="replay hit" color="#777777" fontcolor="#777777" style=dashed];
  idem   -> cache   [label="miss"];
  cache  -> result  [label="cache hit\ncost $0" color="#777777" fontcolor="#777777" style=dashed];
  cache  -> router  [label="miss → compute"];
  router -> fal;
  router -> self;
  router -> det     [label="fall through"];
  fal    -> audit   [label="result"];
  self   -> audit   [style=invis];
  det    -> audit   [style=invis];
  audit  -> result;
  result -> shopper [label="202 / job" constraint=false color="#777777" fontcolor="#777777"];
  shopper -> poll   [label="poll" style=dashed];
  poll   -> shopper [label="job state" style=dashed color="#777777" fontcolor="#777777" constraint=false];
'''
    return _diagram("TryIt — whole-system request flow", "TB", body)


# ---------------------------------------------------------------------------
# 01 — Security gate (ordered fail-closed steps from pipeline.ts)
# ---------------------------------------------------------------------------
def d01() -> str:
    body = r'''
  req   [label="Untrusted request\nBearer + image(s)" style="rounded,dashed,filled" fillcolor="white"];

  s1 [label="1 · verifyApiKey\nconstant-time · scope · tenant"];
  s2 [label="2 · Kill-switch\nglobal OR tenant flag"];
  s3 [label="3 · Image validation\nperson (+ optional garment)"];
  s4 [label="4 · Rate limit\nper-shopper + per-tenant window"];
  s5 [label="5 · Budget guard\nspend + $0.05 ≤ monthly budget"];

  admit [label="Admit\n→ idempotency / cache / engine" fillcolor="#f4f4f4" penwidth=2.4];
  deny  [label="DENY (fail-closed)\n+ append-only audit event\nactor = shopperId (never the key)" fillcolor="#ececec" penwidth=1.2 fontcolor="#444444"];

  req -> s1 -> s2 -> s3 -> s4 -> s5 -> admit [label="pass"];
  s1 -> deny [label="401" color="#777777" fontcolor="#777777" style=dashed];
  s2 -> deny [label="kill-switch" color="#777777" fontcolor="#777777" style=dashed];
  s3 -> deny [label="invalid / too large" color="#777777" fontcolor="#777777" style=dashed];
  s4 -> deny [label="429 retryAfter" color="#777777" fontcolor="#777777" style=dashed];
  s5 -> deny [label="budget exceeded" color="#777777" fontcolor="#777777" style=dashed];
  { rank=same; admit; deny; }
'''
    return _diagram("Security gate — ordered fail-closed steps (pipeline.ts)", "TB", body)


# ---------------------------------------------------------------------------
# 02 — Cache key derivation (tenant-namespaced)
# ---------------------------------------------------------------------------
def d02() -> str:
    body = r'''
  dom    [label="KEY_DOMAIN\n\"tryit/cache/v1\""];
  tenant [label="tenantId" fillcolor="#f4f4f4" penwidth=2.0];
  img    [label="personImageHash\n(SHA-256 of image bytes)"];
  prod   [label="productId"];
  params [label="canonical params\n(sorted-key JSON)"];

  hash   [label="SHA-256\nlength-prefixed fields\nhashField = len ':' utf8bytes" fillcolor="#f4f4f4" penwidth=2.4];
  digest [label="hex digest"];
  key    [label="CACHE KEY\nprefixSafe(tenantId) ':' digest" fillcolor="#f4f4f4" penwidth=2.4];

  dom -> hash;
  tenant -> hash [label="folded into hash"];
  img -> hash;
  prod -> hash;
  params -> hash;
  hash -> digest;
  digest -> key;
  tenant -> key [label="+ prefix (escape % :)\ntenant isolation" color="#777777" fontcolor="#777777" style=dashed];
'''
    return _diagram("Cache key derivation — tenant-namespaced (cache-key.ts)", "TB", body)


# ---------------------------------------------------------------------------
# 03 — Engine provider fallthrough (router.ts)
# ---------------------------------------------------------------------------
def d03() -> str:
    body = r'''
  in   [label="route(request, tenant.config)" style="rounded,dashed,filled" fillcolor="white"];
  ord  [label="orderCandidates\nallow-list ∩ routing ∩ registered\nsort: costUsd ↑, priority ↑, id ↑"];

  fal  [label="fal\n(cheapest / first allowed)"];
  self [label="self-hosted"];
  det  [label="DeterministicProvider\nterminal fallback (always succeeds)" fillcolor="#f4f4f4" penwidth=2.4];

  ok   [label="Success\nstamp provider · latencyMs · cost · cached=false" fillcolor="#f4f4f4" penwidth=2.4];

  in -> ord -> fal;
  fal  -> ok   [label="ok"];
  fal  -> self [label="error / timeout → next" color="#777777" fontcolor="#777777" style=dashed];
  self -> ok   [label="ok"];
  self -> det  [label="error / timeout → next" color="#777777" fontcolor="#777777" style=dashed];
  det  -> ok   [label="ok"];
'''
    return _diagram("Engine provider fall-through (router.ts)", "TB", body)


# ---------------------------------------------------------------------------
# 04 — Catalog connectors
# ---------------------------------------------------------------------------
def d04() -> str:
    body = r'''
  shop [label="Shopify Admin API\nproducts.json (cursor paging)" style="rounded,dashed,filled" fillcolor="white"];
  rest [label="Generic REST feed\n(HTTPS only)" style="rounded,dashed,filled" fillcolor="white"];

  shopc [label="ShopifyConnector\nimages · lead variant price · vendor"];
  restc [label="GenericRestConnector\nFieldMapping (dot-path):\nitemsPath · idPath · titlePath\nimagePath · pricePath · currencyPath"];

  norm  [label="NormalizedProduct\nid · title · imageRefs[] (HTTPS)\nprice? · currency? · category? · vendor?" fillcolor="#f4f4f4" penwidth=2.4];
  skip  [label="skipped[]\n(ref + reason — bad rows dropped)" fillcolor="#ececec" penwidth=1.2 fontcolor="#444444"];

  shop -> shopc;
  rest -> restc;
  shopc -> norm;
  restc -> norm;
  shopc -> skip [label="invalid row" color="#777777" fontcolor="#777777" style=dashed];
  restc -> skip [label="invalid row" color="#777777" fontcolor="#777777" style=dashed];
'''
    return _diagram("Catalog connectors → normalized product (packages/catalog)", "LR", body)


# ---------------------------------------------------------------------------
# 05 — Widget state machine (state.ts)
# ---------------------------------------------------------------------------
def d05() -> str:
    body = r'''
  idle       [label="idle"];
  consent    [label="consent"];
  upload     [label="upload"];
  uploading  [label="uploading"];
  processing [label="processing"];
  result     [label="result" fillcolor="#f4f4f4" penwidth=2.4];
  error      [label="error" fillcolor="#ececec" fontcolor="#444444"];

  idle       -> consent    [label="OPEN"];
  consent    -> upload     [label="CONSENT_ACCEPT\n(fail-closed: sole path,\nsets consentGiven)" fontcolor="#111111"];
  consent    -> idle       [label="CONSENT_DECLINE / CLOSE" color="#777777" fontcolor="#777777" style=dashed];
  upload     -> uploading  [label="SUBMIT (photo set)"];
  upload     -> error      [label="FILE_REJECTED" color="#777777" fontcolor="#777777" style=dashed];
  uploading  -> processing [label="JOB_CREATED"];
  uploading  -> error      [label="JOB_FAILED" color="#777777" fontcolor="#777777" style=dashed];
  processing -> result     [label="JOB_SUCCEEDED"];
  processing -> error      [label="JOB_FAILED" color="#777777" fontcolor="#777777" style=dashed];
  result     -> upload     [label="RETRY" color="#777777" fontcolor="#777777" style=dashed constraint=false];
  error      -> upload     [label="RETRY (consent held)\nelse → idle (fail-closed)" color="#777777" fontcolor="#777777" style=dashed constraint=false];
'''
    return _diagram("Widget state machine — consent fail-closed (state.ts)", "TB", body, splines="polyline")


# ---------------------------------------------------------------------------
# 06 — inference-py backend selection (factory.py)
# ---------------------------------------------------------------------------
def d06() -> str:
    body = r'''
  cfg  [label="settings.backend\n(app.config.Settings)" style="rounded,dashed,filled" fillcolor="white"];
  sw   [label="build_backend(name)" shape=diamond fillcolor="#f4f4f4" penwidth=2.0];

  mock [label="MockBackend\ndefault · torch-free" fillcolor="#f4f4f4" penwidth=2.4];
  leffa[label="LeffaBackend\nlazy import · model extra"];
  err  [label="ValueError\n\"unknown inference backend\"\n(fail-closed — no silent fallback)" fillcolor="#ececec" penwidth=1.2 fontcolor="#444444"];

  cfg -> sw;
  sw -> mock  [label="\"mock\" (default)"];
  sw -> leffa [label="\"leffa\""];
  sw -> err   [label="otherwise" color="#777777" fontcolor="#777777" style=dashed];
'''
    return _diagram("inference-py backend selection (factory.py)", "TB", body)


DIAGRAMS = {
    "00_whole_system_request_flow": ("TryIt — whole-system request flow", d00),
    "01_security_gate": ("Security gate — ordered fail-closed steps", d01),
    "02_cache_key_derivation": ("Cache key derivation — tenant-namespaced", d02),
    "03_engine_provider_fallthrough": ("Engine provider fall-through", d03),
    "04_catalog_connectors": ("Catalog connectors → normalized product", d04),
    "05_widget_state_machine": ("Widget state machine — consent fail-closed", d05),
    "06_inference_py_backend_selection": ("inference-py backend selection", d06),
}


def find_dot() -> str:
    env = os.environ.get("GRAPHVIZ_BIN")
    if env and Path(env).exists():
        return env
    found = shutil.which("dot")
    if found:
        return found
    for candidate in (
        r"C:\Program Files\Graphviz\bin\dot.exe",
        r"C:\Program Files (x86)\Graphviz\bin\dot.exe",
    ):
        if Path(candidate).exists():
            return candidate
    raise SystemExit("Graphviz `dot` not found. Install Graphviz or set GRAPHVIZ_BIN.")


HTML_TEMPLATE = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"/>'
    "<title>{title} — TryIt evidence</title>"
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    "<style>html,body{{margin:0;background:#fafafa;color:#111;"
    "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}}"
    ".wrap{{max-width:1180px;margin:0 auto;padding:32px 20px;}}"
    "h1{{font-size:15px;font-weight:600;letter-spacing:.02em;color:#444;"
    "text-transform:uppercase;margin:0 0 4px;}}"
    "p.sub{{margin:0 0 20px;color:#888;font-size:13px;}}"
    ".frame{{background:#fff;border:1px solid #e6e6e6;border-radius:14px;"
    "padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);}}"
    ".frame svg{{width:100%;height:auto;display:block;}}</style></head><body>"
    '<div class="wrap"><h1>{title}</h1>'
    '<p class="sub">TryIt evidence showcase — monochrome architecture schematic '
    "(auto-laid-out via Graphviz; accurate to current code). See evidence/README.md.</p>"
    '<div class="frame">{svg}</div></div></body></html>'
)


def render() -> None:
    dot = find_dot()
    DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)
    for name, (title, fn) in DIAGRAMS.items():
        src = fn()
        dot_path = DIAGRAMS_DIR / f"{name}.dot"
        svg_path = DIAGRAMS_DIR / f"{name}.svg"
        png_path = DIAGRAMS_DIR / f"{name}.png"
        html_path = DIAGRAMS_DIR / f"{name}.html"

        dot_path.write_text(src, encoding="utf-8")

        # SVG (vector, embedded in HTML) and PNG (high-res raster).
        subprocess.run([dot, "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True)
        subprocess.run(
            [dot, "-Tpng", "-Gdpi=150", str(dot_path), "-o", str(png_path)], check=True
        )

        svg = svg_path.read_text(encoding="utf-8")
        # Drop the XML/DOCTYPE preamble so the SVG embeds cleanly inline.
        idx = svg.find("<svg")
        if idx > 0:
            svg = svg[idx:]
        html_path.write_text(
            HTML_TEMPLATE.format(title=html.escape(title), svg=svg), encoding="utf-8"
        )
        print(f"  rendered {name}: svg+png+html")


if __name__ == "__main__":
    print("Generating TryIt evidence flow diagrams (Graphviz dot, B/W)...")
    render()
    print("Done ->", DIAGRAMS_DIR)
