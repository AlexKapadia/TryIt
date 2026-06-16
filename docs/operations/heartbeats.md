# Heartbeats and Auto-Resume (operator guide)

This repo runs three Windows scheduled tasks that keep the autonomous build
(governed by `claude.md`) resilient and on-spec. All scripts live in
`infra/heartbeats/`. They only ever launch `claude.exe` headless; the build
agent does the actual work.

## The three heartbeats

| Task | Interval | Script | claude.md | Role |
| --- | --- | --- | --- | --- |
| `TryIt-AutoResume` | 45 min | `resume-guard.ps1` | 4.8 | Auto-resume watchdog: relaunches the build if it has stalled (quota reset, crash, session death). |
| `TryIt-NorthStar` | 30 min | `north-star-review.ps1` | 4.7 + 2 | Read-only CCO overseer: grades six areas GREEN/AMBER/RED and writes an alignment report. |
| `TryIt-DesignBeat` | 20 min | `design-heartbeat.ps1` | 4.9 | CDO design review of the live UI once one exists. |

## Idempotency and token-saving guards

Each heartbeat is deliberately cheap and safe to fire repeatedly:

- **No concurrent runs.** Every task is registered with
  `-MultipleInstances IgnoreNew`, so if a previous run is still going the new
  tick is dropped. There is never a second concurrent build.
- **All-complete marker.** When every gate is complete and pushed, the build
  writes `infra/heartbeats/.state/all-complete`. The auto-resume watchdog sees
  it and exits immediately - it stops doing anything once the work is done.
- **North Star recent-activity gate.** The overseer only spends tokens if there
  was a git commit in the last ~35 minutes. An idle repo (no new work to grade)
  is skipped.
- **Design dormancy.** The design heartbeat stays dormant and exits early until
  `apps/demo-shop` or `packages/widget` actually contain UI source files
  (`*.ts/tsx/js/jsx/css`). No UI means no tokens spent.

## Enable

```
powershell -NoProfile -ExecutionPolicy Bypass -File infra\heartbeats\register-heartbeats.ps1
```

This registers all three tasks for the current user. They start when available
and survive reboots, so the build resumes unattended across quota resets and
crashes (resume state comes from git + `ROADMAP.md`).

## Disable

Hard (remove the tasks):

```
powershell -NoProfile -ExecutionPolicy Bypass -File infra\heartbeats\unregister-heartbeats.ps1
```

Soft (pause without removing - every script checks this env var and exits
early):

```
setx TRYIT_HEARTBEATS_DISABLED 1
```

## Where logs and reports land

- Logs: `infra/heartbeats/.state/{resume-guard,north-star,design}.log`
  (git-ignored).
- North Star reports: `docs/alignment/north-star-<timestamp>.md`.
- Design reports: `docs/alignment/design-<timestamp>.md`.

## Safety rationale

The watchdog is resilience-only: it never edits code, never plans, never starts
a second run, and is fully idempotent (does nothing if a run is in progress or
the work is complete). The North Star and design heartbeats are read-only except
for their single timestamped report file. All three honour the
`TRYIT_HEARTBEATS_DISABLED` kill-switch.
