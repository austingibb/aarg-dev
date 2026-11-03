#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$serviceName = 'aarg-steamdb-scraper'
$projectRoot = Split-Path $PSScriptRoot -Parent
$scraperRoot = Join-Path $projectRoot 'scraper'
$nssmExe = Join-Path $PSScriptRoot 'nssm.exe'
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$logDir = Join-Path $projectRoot 'logs'
if (-not (Test-Path -LiteralPath $nssmExe)) { throw 'scripts/nssm.exe is required.' }
if (-not (Test-Path (Join-Path $scraperRoot 'node_modules/playwright-core/package.json'))) { throw 'Run npm ci --prefix scraper first.' }
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { throw "Service '$serviceName' already exists. Inspect before replacing it." }
if (Get-ScheduledTask -TaskName $serviceName -ErrorAction SilentlyContinue) { throw 'Stop and remove the prototype scheduled task before installing the service.' }
New-Item -ItemType Directory -Force $logDir | Out-Null
function Set-Nssm {
    & $nssmExe @args
    if ($LASTEXITCODE -ne 0) { throw "NSSM failed: $args" }
}
Set-Nssm install $serviceName $nodeExe
Set-Nssm set $serviceName AppDirectory $scraperRoot
Set-Nssm set $serviceName AppParameters '--env-file-if-exists=.env index.js'
Set-Nssm set $serviceName DisplayName 'aarg.dev SteamDB scraper'
Set-Nssm set $serviceName Description 'Local SteamDB browser scraper with persistent five-minute request spacing'
Set-Nssm set $serviceName Start SERVICE_AUTO_START
Set-Nssm set $serviceName AppRestartDelay 10000
Set-Nssm set $serviceName AppStdout (Join-Path $logDir 'steamdb-scraper.log')
Set-Nssm set $serviceName AppStderr (Join-Path $logDir 'steamdb-scraper-error.log')
Set-Nssm set $serviceName AppRotateFiles 1
Set-Nssm set $serviceName AppRotateOnline 1
Set-Nssm set $serviceName AppRotateBytes 1048576
Start-Service $serviceName
Write-Output "Started '$serviceName'. Local status: http://127.0.0.1:4175/health"
