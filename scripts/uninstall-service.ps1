#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$serviceName = 'aarg-dev'
$nssmExe     = Join-Path $PSScriptRoot 'nssm.exe'

if (-not (Test-Path $nssmExe)) {
    Write-Host "nssm.exe not found at $nssmExe" -ForegroundColor Red
    exit 1
}

$existing = Get-Service $serviceName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Service '$serviceName' is not installed." -ForegroundColor Yellow
    exit 0
}

Write-Host "Stopping and removing '$serviceName'..." -ForegroundColor Cyan
& $nssmExe stop $serviceName
Start-Sleep -Seconds 2
& $nssmExe remove $serviceName confirm
Write-Host 'Done.' -ForegroundColor Green
