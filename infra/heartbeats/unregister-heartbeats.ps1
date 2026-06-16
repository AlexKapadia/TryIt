# =====================================================================
# unregister-heartbeats.ps1
#
# Removes the three TryIt heartbeat scheduled tasks. Safe to run even if
# a task does not exist (errors are swallowed per task).
#
# SOFTER KILL-SWITCH: if you only want to pause the heartbeats without
# deleting the tasks, set the env var instead -
#   setx TRYIT_HEARTBEATS_DISABLED 1
# Every heartbeat script checks that var and exits early when it is set.
# =====================================================================

$ErrorActionPreference = 'Stop'

$names = @('TryIt-AutoResume', 'TryIt-NorthStar', 'TryIt-DesignBeat')

foreach ($n in $names) {
    try {
        Unregister-ScheduledTask -TaskName $n -Confirm:$false
        Write-Output "Unregistered $n"
    } catch {
        Write-Output "Skipped $n (not found or already removed)"
    }
}

Write-Output 'Done. (Soft kill-switch alternative: setx TRYIT_HEARTBEATS_DISABLED 1)'
