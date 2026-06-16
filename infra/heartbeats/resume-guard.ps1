# =====================================================================
# resume-guard.ps1  -  AUTO-RESUME WATCHDOG (claude.md section 4.8)
#
# PURPOSE: resilience only. If the autonomous build has stalled (quota
# reset, crash, session death), relaunch claude headless to resume from
# git + ROADMAP.md. It never edits code itself and never plans work; it
# just restarts the resumable agent.
#
# IDEMPOTENCY / SAFETY:
#   - The scheduled task uses -MultipleInstances IgnoreNew, so if a run
#     is still in progress this tick is dropped: no second concurrent run.
#   - The .state\all-complete marker (written by the build when every
#     gate is done + pushed) makes this exit immediately - the watchdog
#     stops doing anything once the work is complete.
#   - TRYIT_HEARTBEATS_DISABLED is a soft kill-switch.
# =====================================================================

$ErrorActionPreference = 'Stop'
$Repo  = 'C:\dev\TryIt'
$State = "$Repo\infra\heartbeats\.state"

New-Item -ItemType Directory -Force -Path $State | Out-Null

$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

if ($env:TRYIT_HEARTBEATS_DISABLED) {
    "$ts resume-guard: TRYIT_HEARTBEATS_DISABLED set, skipping" | Out-File -Append "$State\resume-guard.log"
    exit 0
}

if (Test-Path "$State\all-complete") {
    "$ts resume-guard: all gates complete, nothing to do" | Out-File -Append "$State\resume-guard.log"
    exit 0
}

# Liveness guard: a watchdog must only resume a STALLED run. If any claude
# process is already alive (an interactive session or a prior resume that is
# still working), the run has not stalled - skip, so we never start a second
# concurrent run (claude.md 4.8). This is the primary anti-overlap check;
# the scheduler's IgnoreNew only stops THIS task overlapping itself.
$alive = Get-Process -Name claude -ErrorAction SilentlyContinue
if ($alive) {
    "$ts resume-guard: claude already running (run alive), skipping" | Out-File -Append "$State\resume-guard.log"
    exit 0
}

"$ts resume-guard: tick - no claude alive, attempting resume" | Out-File -Append "$State\resume-guard.log"

try { git -C $Repo pull --ff-only } catch {}

try {
    $prompt = Get-Content "$Repo\infra\heartbeats\prompts\resume-prompt.md" -Raw
    & 'C:\Users\alexa\.local\bin\claude.exe' -p $prompt --permission-mode acceptEdits 2>&1 |
        Out-File -Append "$State\resume-guard.log"
} catch {
    "$ts resume-guard: launch failed: $_" | Out-File -Append "$State\resume-guard.log"
}

exit 0
