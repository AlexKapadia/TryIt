# =====================================================================
# design-heartbeat.ps1  -  DESIGN HEARTBEAT / CDO REVIEW (claude.md 4.9)
#
# PURPOSE: the CDO / Head of Design heartbeat. Reviews the live/visual UI
# against the design brief and holds the institution-grade bar. It is
# read-only except for its findings report.
#
# DORMANCY GATE: there is no UI early in the build, so this stays dormant
# until apps\demo-shop or packages\widget actually contain UI source
# files. With no UI present it exits immediately - no tokens spent.
#
# SAFETY: scheduled task uses -MultipleInstances IgnoreNew (no overlap).
# TRYIT_HEARTBEATS_DISABLED is a soft kill-switch.
# =====================================================================

$ErrorActionPreference = 'Stop'
$Repo  = 'C:\dev\TryIt'
$State = "$Repo\infra\heartbeats\.state"

New-Item -ItemType Directory -Force -Path $State | Out-Null

$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

if ($env:TRYIT_HEARTBEATS_DISABLED) {
    "$ts design: TRYIT_HEARTBEATS_DISABLED set, skipping" | Out-File -Append "$State\design.log"
    exit 0
}

$ui = Get-ChildItem "$Repo\apps\demo-shop", "$Repo\packages\widget" -Recurse -File `
        -Include *.ts, *.tsx, *.js, *.jsx, *.css -ErrorAction SilentlyContinue

if (-not $ui) {
    "$ts design: no UI yet, dormant" | Out-File -Append "$State\design.log"
    exit 0
}

"$ts design: UI source detected - running CDO review" | Out-File -Append "$State\design.log"

$designPrompt = @'
You are the CDO / Head of Design for the TryIt build, per C:\dev\TryIt\claude.md
section 4.9. Read claude.md, ROADMAP.md, and the design brief under docs/design.
Review the live / visual UI of the running app and its source against that brief
and the institution-grade bar: deliberate type + spacing scale, real hierarchy,
restraint, motion craft, no AI-slop/vibe-coded signature, every state covered
(loading / empty / error / edge), and nothing static (every visible or clickable
element wired to real behaviour). You are READ-ONLY except for one report file:
write your findings to docs/alignment/design-<timestamp>.md where <timestamp> is
the current UTC time as YYYYMMDD-HHMMSS. Keep it short and actionable.
'@

try {
    & 'C:\Users\alexa\.local\bin\claude.exe' -p $designPrompt --permission-mode acceptEdits 2>&1 |
        Out-File -Append "$State\design.log"
} catch {
    "$ts design: launch failed: $_" | Out-File -Append "$State\design.log"
}

exit 0
