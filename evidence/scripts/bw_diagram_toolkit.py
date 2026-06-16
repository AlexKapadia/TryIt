"""bw_diagram_toolkit — minimal, dependency-light black-&-white SVG flow-diagram primitives.

Why this exists: the evidence showcase needs genuinely monochrome, professional flow
diagrams exported as BOTH .html and .png, with no system Graphviz available. This module
hand-builds clean SVG (boxes, arrows, swimlanes, labels) in a strict black/white/grey
palette, then writes an interactive .html wrapper and rasterises a .png via cairosvg.

Strictly an ANALYSIS-ONLY artifact: it lives under evidence/ and is never imported by any
runtime package. Palette is intentionally limited to ink (#111), paper (#fff), and two
greys so every diagram reads as a print-quality monochrome schematic.
"""
from __future__ import annotations

import html as _html
from dataclasses import dataclass, field
from pathlib import Path
import cairosvg

INK = "#111111"          # primary stroke / text
PAPER = "#ffffff"        # background
GREY = "#888888"         # secondary stroke (fallthrough / optional edges)
LIGHT = "#f4f4f4"        # subtle fill for emphasis boxes
FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"


@dataclass
class Box:
    """A labelled node. `kind` selects styling: 'solid', 'emphasis', 'dashed', 'pill'."""

    x: float
    y: float
    w: float
    h: float
    title: str
    subtitle: str = ""
    kind: str = "solid"


@dataclass
class Edge:
    """A directed connector between two points. `style` is 'solid' or 'dashed' (fallthrough)."""

    x1: float
    y1: float
    x2: float
    y2: float
    label: str = ""
    style: str = "solid"
    curve: float = 0.0  # vertical control offset for a gentle bezier when non-zero


@dataclass
class Diagram:
    """An ordered collection of boxes and edges rendered onto one monochrome canvas."""

    width: int
    height: int
    title: str
    boxes: list[Box] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    notes: list[tuple[float, float, str]] = field(default_factory=list)

    def add_box(self, box: Box) -> Box:
        self.boxes.append(box)
        return box

    def add_edge(self, edge: Edge) -> Edge:
        self.edges.append(edge)
        return edge

    def add_note(self, x: float, y: float, text: str) -> None:
        self.notes.append((x, y, text))


def _esc(text: str) -> str:
    return _html.escape(text, quote=True)


def _wrap(text: str, max_chars: int) -> list[str]:
    """Greedy word-wrap so note prose stays inside the canvas. Pure, no deps."""
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        candidate = f"{cur} {w}".strip()
        if len(candidate) > max_chars and cur:
            lines.append(cur)
            cur = w
        else:
            cur = candidate
    if cur:
        lines.append(cur)
    return lines or [""]


def _title_svg(cx: float, y0: float, title: str) -> str:
    """Render a box title, honouring an embedded newline as two stacked lines."""
    lines = title.split("\n")
    out = []
    for i, line in enumerate(lines):
        dy = y0 + i * 16
        out.append(
            f'<text x="{cx}" y="{dy}" text-anchor="middle" font-family="{FONT}" '
            f'font-size="14" font-weight="600" fill="{INK}">{_esc(line)}</text>'
        )
    return "\n".join(out)


def _box_svg(b: Box) -> str:
    rx = b.h / 2 if b.kind == "pill" else 10
    fill = LIGHT if b.kind == "emphasis" else PAPER
    dash = ' stroke-dasharray="6 5"' if b.kind == "dashed" else ""
    stroke_w = 2.4 if b.kind == "emphasis" else 1.6
    parts = [
        f'<rect x="{b.x}" y="{b.y}" width="{b.w}" height="{b.h}" rx="{rx}" ry="{rx}" '
        f'fill="{fill}" stroke="{INK}" stroke-width="{stroke_w}"{dash}/>'
    ]
    cx = b.x + b.w / 2
    multiline = "\n" in b.title
    if b.subtitle:
        top = b.y + b.h / 2 - (12 if multiline else 4)
        parts.append(_title_svg(cx, top, b.title))
        sub_y = b.y + b.h / 2 + (20 if multiline else 15)
        parts.append(
            f'<text x="{cx}" y="{sub_y}" text-anchor="middle" '
            f'font-family="{FONT}" font-size="11" fill="{GREY}">{_esc(b.subtitle)}</text>'
        )
    else:
        top = b.y + b.h / 2 - (3 if multiline else -5)
        parts.append(_title_svg(cx, top, b.title))
    return "\n".join(parts)


def _edge_svg(e: Edge, idx: int) -> str:
    colour = GREY if e.style == "dashed" else INK
    dash = ' stroke-dasharray="7 5"' if e.style == "dashed" else ""
    marker = "arrowGrey" if e.style == "dashed" else "arrowInk"
    if e.curve:
        mx = (e.x1 + e.x2) / 2
        cy = (e.y1 + e.y2) / 2 + e.curve
        path = f'M {e.x1} {e.y1} Q {mx} {cy} {e.x2} {e.y2}'
        line = (
            f'<path d="{path}" fill="none" stroke="{colour}" stroke-width="1.6"{dash} '
            f'marker-end="url(#{marker})"/>'
        )
        lx, ly = mx, cy - 6
    else:
        line = (
            f'<line x1="{e.x1}" y1="{e.y1}" x2="{e.x2}" y2="{e.y2}" stroke="{colour}" '
            f'stroke-width="1.6"{dash} marker-end="url(#{marker})"/>'
        )
        lx, ly = (e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2 - 6
    out = [line]
    if e.label:
        out.append(
            f'<text x="{lx}" y="{ly}" text-anchor="middle" font-family="{FONT}" '
            f'font-size="10.5" fill="{colour}">'
            f'<tspan dx="0" dy="0" style="paint-order:stroke;stroke:{PAPER};stroke-width:4px">'
            f'{_esc(e.label)}</tspan></text>'
        )
    return "\n".join(out)


def render_svg(d: Diagram) -> str:
    """Render the diagram to a standalone monochrome SVG string."""
    defs = (
        '<defs>'
        f'<marker id="arrowInk" markerWidth="9" markerHeight="9" refX="7" refY="3" '
        f'orient="auto" markerUnits="strokeWidth">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker>'
        f'<marker id="arrowGrey" markerWidth="9" markerHeight="9" refX="7" refY="3" '
        f'orient="auto" markerUnits="strokeWidth">'
        f'<path d="M0,0 L7,3 L0,6 Z" fill="{GREY}"/></marker>'
        '</defs>'
    )
    body = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{d.width}" height="{d.height}" '
        f'viewBox="0 0 {d.width} {d.height}">',
        defs,
        f'<rect width="{d.width}" height="{d.height}" fill="{PAPER}"/>',
        f'<text x="{d.width/2}" y="38" text-anchor="middle" font-family="{FONT}" '
        f'font-size="20" font-weight="700" fill="{INK}">{_esc(d.title)}</text>',
    ]
    for i, e in enumerate(d.edges):  # edges first so boxes sit on top
        body.append(_edge_svg(e, i))
    for b in d.boxes:
        body.append(_box_svg(b))
    for nx, ny, text in d.notes:
        # Wrap notes to the canvas width (~0.55em per char at 11px) so prose never
        # runs off the right edge of the diagram.
        max_chars = max(20, int((d.width - nx - 30) / 6.0))
        for j, line in enumerate(_wrap(text, max_chars)):
            body.append(
                f'<text x="{nx}" y="{ny + j * 16}" font-family="{FONT}" font-size="11" '
                f'font-style="italic" fill="{GREY}">{_esc(line)}</text>'
            )
    body.append("</svg>")
    return "\n".join(body)


def _html_wrapper(title: str, svg: str) -> str:
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"/>"
        f"<title>{_esc(title)} — TryIt evidence</title>"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
        "<style>"
        "html,body{margin:0;background:#fafafa;color:#111;"
        f"font-family:{FONT};}}"
        ".wrap{max-width:1180px;margin:0 auto;padding:32px 20px;}"
        "h1{font-size:15px;font-weight:600;letter-spacing:.02em;color:#444;"
        "text-transform:uppercase;margin:0 0 4px;}"
        "p.sub{margin:0 0 20px;color:#888;font-size:13px;}"
        ".frame{background:#fff;border:1px solid #e6e6e6;border-radius:14px;"
        "padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}"
        ".frame svg{width:100%;height:auto;display:block;}"
        "</style></head><body><div class=\"wrap\">"
        f"<h1>{_esc(title)}</h1>"
        "<p class=\"sub\">TryIt evidence showcase — monochrome architecture schematic "
        "(see evidence/README.md). Hover edges for labels.</p>"
        f"<div class=\"frame\">{svg}</div></div></body></html>"
    )


def export(d: Diagram, out_dir: Path, stem: str) -> tuple[Path, Path]:
    """Write `<stem>.svg`/.html/.png for the diagram and return the (html, png) paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    svg = render_svg(d)
    svg_path = out_dir / f"{stem}.svg"
    html_path = out_dir / f"{stem}.html"
    png_path = out_dir / f"{stem}.png"
    svg_path.write_text(svg, encoding="utf-8")
    html_path.write_text(_html_wrapper(d.title, svg), encoding="utf-8")
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(png_path), scale=2.0)
    return html_path, png_path
