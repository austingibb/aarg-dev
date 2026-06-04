#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path $PSScriptRoot -Parent
$serviceName = 'aarg-dev'
$nssmExe     = Join-Path $PSScriptRoot 'nssm.exe'
$logDir      = Join-Path $projectRoot 'logs'

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

# ── Verify Node ───────────────────────────────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host 'Node.js not found in PATH.' -ForegroundColor Red
    exit 1
}
$nodePath = $nodeCmd.Source

# ── Verify vite entry point ───────────────────────────────────────────────────
$viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteEntry)) {
    Write-Host "vite not found at $viteEntry" -ForegroundColor Red
    Write-Host "Run 'npm install' in the project root first." -ForegroundColor Yellow
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

# ── Remove existing service ───────────────────────────────────────────────────
$existing = Get-Service $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing '$serviceName' service..." -ForegroundColor Yellow
    & $nssmExe stop $serviceName
    Start-Sleep -Seconds 2
    & $nssmExe remove $serviceName confirm
}

New-Item -ItemType Directory -Force $logDir | Out-Null

# ── Install ───────────────────────────────────────────────────────────────────
Write-Host "Installing service '$serviceName'..." -ForegroundColor Cyan

& $nssmExe install $serviceName $nodePath
& $nssmExe set $serviceName AppParameters   "`"$viteEntry`" preview"
& $nssmExe set $serviceName AppDirectory    $projectRoot
& $nssmExe set $serviceName DisplayName     'aarg.dev'
& $nssmExe set $serviceName Description     'aarg.dev static site (Vite preview)'
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
