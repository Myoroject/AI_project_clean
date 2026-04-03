# DocMind - Run Both Servers in Single Terminal
# Usage: .\run-dev.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "      DocMind Development Server        " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $projectRoot "frontend"

# Verify directories
if (-not (Test-Path $frontendDir)) {
    Write-Host "[ERROR] Frontend directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Starting Flask backend and Next.js frontend..." -ForegroundColor Yellow
Write-Host "[INFO] Press Ctrl+C to stop both servers" -ForegroundColor Gray
Write-Host ""

# Start Flask as a background job
$flaskJob = Start-Job -ScriptBlock {
    param($root)
    Set-Location $root
    $env:FLASK_APP = "app"
    $env:FLASK_DEBUG = "1"
    flask run --port 5000
} -ArgumentList $projectRoot

Write-Host "[FLASK] Backend starting on http://localhost:5000" -ForegroundColor Green

# Give Flask time to start
Start-Sleep -Seconds 3

# Start Next.js as a background job
$nextJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev
} -ArgumentList $frontendDir

Write-Host "[NEXTJS] Frontend starting on http://localhost:3000" -ForegroundColor Blue
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3000      " -ForegroundColor White
Write-Host "  Backend:  http://localhost:5000      " -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Streaming server output below..." -ForegroundColor Gray
Write-Host "(Press Ctrl+C to stop both servers)" -ForegroundColor Gray
Write-Host ""

# Stream output from both jobs
try {
    while ($true) {
        # Get Flask output
        $flaskOutput = Receive-Job -Job $flaskJob -ErrorAction SilentlyContinue
        if ($flaskOutput) {
            $flaskOutput | ForEach-Object { Write-Host "[FLASK] $_" -ForegroundColor Yellow }
        }
        
        # Get Next.js output
        $nextOutput = Receive-Job -Job $nextJob -ErrorAction SilentlyContinue
        if ($nextOutput) {
            $nextOutput | ForEach-Object { Write-Host "[NEXTJS] $_" -ForegroundColor Cyan }
        }
        
        # Check if jobs are still running
        if ($flaskJob.State -eq 'Failed' -or $nextJob.State -eq 'Failed') {
            Write-Host "[ERROR] One of the servers failed!" -ForegroundColor Red
            break
        }
        
        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Cleanup on Ctrl+C
    Write-Host ""
    Write-Host "[INFO] Stopping servers..." -ForegroundColor Yellow
    Stop-Job -Job $flaskJob -ErrorAction SilentlyContinue
    Stop-Job -Job $nextJob -ErrorAction SilentlyContinue
    Remove-Job -Job $flaskJob -Force -ErrorAction SilentlyContinue
    Remove-Job -Job $nextJob -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Servers stopped." -ForegroundColor Green
}
