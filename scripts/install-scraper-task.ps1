# User-level prototype startup. Runs after Windows login, without admin rights.
$ErrorActionPreference = 'Stop'
$taskName = 'aarg-steamdb-scraper'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $PSScriptRoot 'run-steamdb-scraper.ps1'
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "Task '$taskName' already exists. Inspect it before replacing it."
}
if (Get-Service -Name $taskName -ErrorAction SilentlyContinue) {
    throw "Service '$taskName' already exists; do not run two workers."
}
if (-not (Test-Path (Join-Path $projectRoot 'scraper/node_modules/playwright-core/package.json'))) {
    throw 'Install scraper dependencies first: npm ci --prefix scraper'
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
$principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'SteamDB scraper prototype; sequential five-minute visits and local cache' | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Started '$taskName'. Local status: http://127.0.0.1:4175/health"
