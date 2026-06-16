# TryIt Documentation

TryIt is an open-source virtual try-on platform: a fail-closed REST API, an embeddable widget,
a typed server SDK, and catalog connectors. This index links every doc.

## Start here

- **[Integration Guide](./integration-guide.md)** — adopt TryIt three ways: hosted API, embeddable `<tryit-widget>`, or the `@tryit/sdk-node` server SDK, plus catalog auto-connect.
- **[API Reference](./api-reference.md)** — precise REST reference: endpoints, schemas, status codes, the full ErrorCode → HTTP table, auth, rate limiting, CORS, and the job lifecycle.

## Running TryIt

- **[Self-Hosting](./self-hosting.md)** — deploy and operate your own instance. *(Authored separately.)*
- **[Operations: Heartbeats](./operations/heartbeats.md)** — recurring alignment / watchdog cadence for long-running builds.

## Security & design

- **[Threat Model](./threat-model.md)** — STRIDE threat model and the controls that mitigate each threat.
- **[Design](./design/)** — design brief, design tokens, component inventory, and user flows for the widget and UI.

## Research & decisions

- **[Research](./research/)** — peer-reviewed method survey (one folder per paper: IDM-VTON, CatVTON, OOTDiffusion, Leffa, VITON-HD), the provider survey, and the recorded method-selection decision.
- **[Alignment](./alignment/)** — North Star alignment review records grading security, structure, tests, and production-readiness.

## Evidence & quality

- **[Mutation Testing](./mutation-testing.md)** — mutation-score discipline proving the test suite has teeth. *(Authored separately.)*
- **[Evidence](../evidence/)** — the statistical and visual showcase (graphs, flow diagrams, KPIs). *(Maintained separately, at the repo root.)*
