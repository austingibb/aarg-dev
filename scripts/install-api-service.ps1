#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path $PSScriptRoot -Parent
$serviceName = 'aarg-dev-api'
$nodeExe     = 'node'
$logDir      = Join-Path $projectRoot 'logs'
$envPath     = Join-Path $projectRoot '.env'
$entryPath   = Join-Path $projectRoot 'server\index.js'

# ── Verify Node ───────────────────────────────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host 'node not found on PATH.' -ForegroundColor Red
    Write-Host 'Install Node.js (v24+) first.' -ForegroundColor Yellow
    exit 1
}

# ── Verify .env ───────────────────────────────────────────────────────────────
if (-not (Test-Path $envPath)) {
    Write-Host '.env not found at project root.' -ForegroundColor Red
    Write-Host 'Generate secrets first:' -ForegroundColor Yellow
    Write-Host '  node scripts\generate-secrets.js' -ForegroundColor Cyan
    exit 1
}

# ── Verify entry point ───────────────────────────────────────────────────────
if (-not (Test-Path $entryPath)) {
    Write-Host "server\index.js not found at $entryPath" -ForegroundColor Red
    exit 1
}

# NSSM lives alongside this script (shared with install-service.ps1).
$nssmExe = Join-Path $PSScriptRoot 'nssm.exe'
if (-not (Test-Path $nssmExe)) {
    Write-Host "nssm.exe not found at $nssmExe" -ForegroundColor Red
    exit 1
}

# ── Prep data/ + logs/ ───────────────────────────────────────────────────────
New-Item -ItemType Directory -Force (Join-Path $projectRoot 'data') | Out-Null
New-Item -ItemType Directory -Force $logDir | Out-Null

# ── Remove existing service ───────────────────────────────────────────────────
$existing = Get-Service $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing '$serviceName' service..." -ForegroundColor Yellow
    & $nssmExe stop $serviceName
    Start-Sleep -Seconds 2
    & $nssmExe remove $serviceName confirm
    Start-Sleep -Seconds 1
}

# ── Install ───────────────────────────────────────────────────────────────────
Write-Host "Installing service '$serviceName'..." -ForegroundColor Cyan

$appParams = "--env-file=.env server\index.js"

& $nssmExe install $serviceName $nodeCmd.Source
& $nssmExe set $serviceName AppParameters   $appParams
& $nssmExe set $serviceName AppDirectory    $projectRoot
& $nssmExe set $serviceName DisplayName     'aarg.dev API'
& $nssmExe set $serviceName Description     'aarg.dev backend API (node:http + node:sqlite)'
& $nssmExe set $serviceName Start           SERVICE_AUTO_START
& $nssmExe set $serviceName AppRestartDelay 5000
& $nssmExe set $serviceName AppStdout       (Join-Path $logDir 'api-service.log')
& $nssmExe set $serviceName AppStderr       (Join-Path $logDir 'api-service-error.log')
& $nssmExe set $serviceName AppRotateFiles  1
& $nssmExe set $serviceName AppRotateBytes  1048576

# ── Start ─────────────────────────────────────────────────────────────────────
Write-Host 'Starting service...' -ForegroundColor Cyan
Start-Service $serviceName
Start-Sleep -Seconds 2

# ── Smoke test ────────────────────────────────────────────────────────────────
Write-Host 'Smoke-testing /api/auth/me ...' -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/auth/me' -TimeoutSec 5
    Write-Host ("  -> " + ($resp | ConvertTo-Json -Compress)) -ForegroundColor Green
} catch {
    Write-Host "  smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  check logs\api-service-error.log' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "Running at http://127.0.0.1:4174 (behind nginx /api/ proxy)" -ForegroundColor Green
Write-Host "Logs: $logDir" -ForegroundColor DarkGray
