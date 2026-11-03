$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$scraperRoot = Join-Path $projectRoot 'scraper'
$logDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$outputLog = Join-Path $logDir 'steamdb-scraper.log'
$errorLog = Join-Path $logDir 'steamdb-scraper-error.log'
foreach ($logFile in @($outputLog, $errorLog)) {
    if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 0) {
        Copy-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force
        Clear-Content -LiteralPath $logFile
    }
}
$nodeArgs = @('index.js')
if (Test-Path (Join-Path $scraperRoot '.env')) { $nodeArgs = @('--env-file=.env', 'index.js') }
# Start-Process redirects native stderr without PowerShell 5 treating ordinary
# Node diagnostics as terminating NativeCommandError exceptions.
Add-Type -Path (Join-Path $PSScriptRoot 'ScraperProcessJob.cs')
$processJob = New-Object ScraperProcessJob
$workerProcess = $null
try {
    $workerProcess = Start-Process -FilePath (Get-Command node -ErrorAction Stop).Source -ArgumentList $nodeArgs -WorkingDirectory $scraperRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $processJob.Attach($workerProcess.Handle)
    $workerProcess.WaitForExit()
    exit $workerProcess.ExitCode
} catch {
    if ($workerProcess -and -not $workerProcess.HasExited) { $workerProcess.Kill() }
    ($_ | Out-String) | Add-Content -LiteralPath $errorLog
    exit 1
} finally {
    $processJob.Dispose()
}
