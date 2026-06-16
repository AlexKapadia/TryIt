# =====================================================================
# register-heartbeats.ps1
#
# Registers the three TryIt heartbeat scheduled tasks via the
# ScheduledTasks module (Windows PowerShell 5.1):
#   - TryIt-AutoResume (45 min) -> resume-guard.ps1     (claude.md 4.8)
#   - TryIt-NorthStar  (30 min) -> north-star-review.ps1(claude.md 4.7/2)
#   - TryIt-DesignBeat (20 min) -> design-heartbeat.ps1 (claude.md 4.9)
#
# Each task repeats on its interval indefinitely. -MultipleInstances
# IgnoreNew guarantees a tick is dropped while a previous run is still
# going, so there is never a second concurrent run.
#
# Run this manually to enable the heartbeats:
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra\heartbeats\register-heartbeats.ps1
# =====================================================================

$ErrorActionPreference = 'Stop'
$Repo = 'C:\dev\TryIt'
$Beat = "$Repo\infra\heartbeats"
$User = "$env:USERDOMAIN\$env:USERNAME"

$tasks = @(
    @{ Name = 'TryIt-AutoResume'; Minutes = 45; Script = "$Beat\resume-guard.ps1" },
    @{ Name = 'TryIt-NorthStar';  Minutes = 30; Script = "$Beat\north-star-review.ps1" },
    @{ Name = 'TryIt-DesignBeat'; Minutes = 20; Script = "$Beat\design-heartbeat.ps1" }
)

foreach ($t in $tasks) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $t.Script)

    # PS5.1 pattern: build a -Once trigger, then graft on a repetition
    # built by a second helper trigger (Repetition is read-only on the
    # base trigger, so we copy the one with the repetition we want).
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
    # Omit -RepetitionDuration: it defaults to indefinite. Passing
    # [TimeSpan]::MaxValue serialises to P99999999DT... which Task
    # Scheduler rejects (HRESULT 0x80041318).
    $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes $t.Minutes)).Repetition

    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
        -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger $trigger `
        -Settings $settings -User $User -Force | Out-Null

    Write-Output ("Registered {0} (every {1} min) -> {2}" -f $t.Name, $t.Minutes, $t.Script)
}

Write-Output 'All three TryIt heartbeats registered.'
