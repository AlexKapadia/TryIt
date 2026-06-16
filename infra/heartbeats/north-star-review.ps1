# =====================================================================
# north-star-review.ps1  -  NORTH STAR / CCO REVIEW (claude.md 4.7 + 2)
#
# PURPOSE: a read-only senior-overseer pass that grades six areas
# GREEN/AMBER/RED and writes an alignment report. It never edits code.
#
# RECENT-ACTIVITY TOKEN GATE: launching claude costs tokens, so this
# fires only when there has been real progress. If the most recent git
# commit is older than ~35 minutes, the repo is idle (no new work to
# grade) and we skip this tick entirely - keeping the heartbeat cheap.
#
# SAFETY: the scheduled task uses -MultipleInstances IgnoreNew so two
# reviews never overlap. TRYIT_HEARTBEATS_DISABLED is a soft kill-switch.
# =====================================================================

$ErrorActionPreference = 'Stop'
$Repo  = 'C:\dev\TryIt'
$State = "$Repo\infra\heartbeats\.state"

New-Item -ItemType Directory -Force -Path $State | Out-Null

$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

if ($env:TRYIT_HEARTBEATS_DISABLED) {
    "$ts north-star: TRYIT_HEARTBEATS_DISABLED set, skipping" | Out-File -Append "$State\north-star.log"
    exit 0
}

$last = [int](git -C $Repo log -1 --format=%ct)
$now  = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if ((($now - $last) / 60) -gt 35) {
    "$ts north-star: repo idle (last commit > 35 min), skipping" | Out-File -Append "$State\north-star.log"
    exit 0
}

New-Item -ItemType Directory -Force -Path "$Repo\docs\alignment" | Out-Null

"$ts north-star: recent activity detected - running review" | Out-File -Append "$State\north-star.log"

try {
    $prompt = Get-Content "$Repo\infra\heartbeats\prompts\north-star-prompt.md" -Raw
    & 'C:\Users\alexa\.local\bin\claude.exe' -p $prompt --permission-mode acceptEdits 2>&1 |
        Out-File -Append "$State\north-star.log"
} catch {
    "$ts north-star: launch failed: $_" | Out-File -Append "$State\north-star.log"
}

exit 0
