#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path $PSScriptRoot -Parent
$serviceName = 'aarg-dev'
$nssmExe     = Join-Path $PSScriptRoot 'nssm.exe'
$logDir      = Join-Path $projectRoot 'logs'
$nginxExe    = 'C:\nginx\nginx.exe'
$nginxPrefix = 'C:/nginx'
$confPath    = Join-Path $projectRoot 'nginx.conf'

# ── Verify NSSM ──────────────────────────────────────────────────────────────
if (-not (Test-Path $nssmExe)) {
    Write-Host ''
    Write-Host 'nssm.exe not found.' -ForegroundColor Red
    Write-Host ''
    Write-Host '  1. Download: https://nssm.cc/release/nssm-2.24.zip'
    Write-Host '  2. Extract nssm.exe from the win64 folder'
    Write-Host "  3. Place it here: $nssmExe"
    Write-Host ''
    exit 1
}

# ── Verify NGINX ──────────────────────────────────────────────────────────────
if (-not (Test-Path $nginxExe)) {
    Write-Host "nginx not found at $nginxExe" -ForegroundColor Red
    Write-Host 'Install nginx for Windows to C:\nginx first (https://nginx.org/en/download.html).' -ForegroundColor Yellow
    exit 1
}

# ── Verify nginx.conf ─────────────────────────────────────────────────────────
if (-not (Test-Path $confPath)) {
    Write-Host "nginx.conf not found at $confPath" -ForegroundColor Red
    exit 1
}

# ── Build ─────────────────────────────────────────────────────────────────────
Write-Host 'Building project...' -ForegroundColor Cyan
Push-Location $projectRoot
npm run build
$exitCode = $LASTEXITCODE
Pop-Location
if ($exitCode -ne 0) {
    Write-Host 'Build failed. Aborting.' -ForegroundColor Red
    exit 1
}

# ── Validate nginx config ─────────────────────────────────────────────────────
Write-Host 'Testing nginx config...' -ForegroundColor Cyan
& $nginxExe -p $nginxPrefix -c $confPath -t
if ($LASTEXITCODE -ne 0) {
    Write-Host 'nginx config test failed. Aborting.' -ForegroundColor Red
    exit 1
}

# ── Remove existing service ───────────────────────────────────────────────────
$existing = Get-Service $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing '$serviceName' service..." -ForegroundColor Yellow
    & $nssmExe stop $serviceName
    Start-Sleep -Seconds 2
    & $nssmExe remove $serviceName confirm
    Start-Sleep -Seconds 1
}

New-Item -ItemType Directory -Force $logDir | Out-Null

# ── Install ───────────────────────────────────────────────────────────────────
# `daemon off;` lives inside nginx.conf (NSSM mangles -g quoting), keeping nginx
# in the foreground so the service wrapper can supervise it.
Write-Host "Installing service '$serviceName'..." -ForegroundColor Cyan

$appParams = "-p $nginxPrefix -c `"$confPath`""

& $nssmExe install $serviceName $nginxExe
& $nssmExe set $serviceName AppParameters   $appParams
& $nssmExe set $serviceName AppDirectory    'C:\nginx'
& $nssmExe set $serviceName DisplayName     'aarg.dev'
& $nssmExe set $serviceName Description     'aarg.dev static site (nginx)'
& $nssmExe set $serviceName Start           SERVICE_AUTO_START
& $nssmExe set $serviceName AppRestartDelay 5000
& $nssmExe set $serviceName AppStdout       (Join-Path $logDir 'service.log')
& $nssmExe set $serviceName AppStderr       (Join-Path $logDir 'service-error.log')
& $nssmExe set $serviceName AppRotateFiles  1
& $nssmExe set $serviceName AppRotateBytes  1048576

# ── Start ─────────────────────────────────────────────────────────────────────
Write-Host 'Starting service...' -ForegroundColor Cyan
Start-Service $serviceName

Write-Host ''
Write-Host "Running at http://localhost:4173" -ForegroundColor Green
Write-Host "Logs: $logDir" -ForegroundColor DarkGray
