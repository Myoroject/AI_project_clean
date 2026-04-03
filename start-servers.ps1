# DocMind - Start Both Servers
# This script starts the Next.js frontend and Flask backend concurrently

Write-Host "[DocMind] Starting Both Servers..." -ForegroundColor Cyan
Write-Host ""

# Get the script directory (project root)
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $projectRoot "frontend"

# Check if directories exist
if (-not (Test-Path $frontendDir)) {
    Write-Host "[ERROR] Frontend directory not found: $frontendDir" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Project Root: $projectRoot" -ForegroundColor Gray
Write-Host "[INFO] Frontend Dir: $frontendDir" -ForegroundColor Gray
Write-Host ""

# Start Flask backend in a new window
Write-Host "[FLASK] Starting backend on http://localhost:5000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot'; Write-Host 'Flask Backend Server' -ForegroundColor Green; flask --app app run --port 5000 --debug"

# Give Flask a moment to start
Start-Sleep -Seconds 2

# Start Next.js frontend in a new window
Write-Host "[NEXTJS] Starting frontend on http://localhost:3000..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; Write-Host 'Next.js Frontend Server' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "[OK] Both servers are starting!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend - Next.js: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend  - Flask:   http://localhost:5000" -ForegroundColor Cyan
Write-Host ""
Write-Host "[TIP] Close both terminal windows to stop the servers." -ForegroundColor Gray
