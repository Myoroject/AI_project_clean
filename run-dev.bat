@echo off
REM DocMind - Run Both Servers in Single Terminal
REM Usage: run-dev.bat

echo ========================================
echo       DocMind Development Server        
echo ========================================
echo.

set PROJECT_ROOT=%~dp0
set FRONTEND_DIR=%PROJECT_ROOT%frontend

echo [INFO] Project Root: %PROJECT_ROOT%
echo [INFO] Frontend Dir: %FRONTEND_DIR%
echo.

REM Check if frontend exists
if not exist "%FRONTEND_DIR%" (
    echo [ERROR] Frontend directory not found!
    pause
    exit /b 1
)

echo [INFO] Starting Flask backend and Vite frontend...
echo [INFO] Press Ctrl+C to stop both servers
echo.

REM Start Flask in a new minimized window
echo [FLASK] Backend starting on http://localhost:5000
start "Flask Backend" /min cmd /c "cd /d %PROJECT_ROOT% && flask --app app run --port 5000 --debug"

REM Wait 3 seconds for Flask
timeout /t 3 /nobreak > nul

REM Start Vite in a new minimized window
echo [VITE] Frontend starting on http://localhost:5173
start "Vite Frontend" /min cmd /c "cd /d %FRONTEND_DIR% && npm run dev"

echo.
echo ========================================
echo   Frontend: http://localhost:5173      
echo   Backend:  http://localhost:5000      
echo ========================================
echo.
echo Both servers are running in minimized windows.
echo Close this window and those windows to stop.
echo.
echo Opening browser to http://localhost:5173 in 5 seconds...
timeout /t 5 /nobreak > nul
start http://localhost:5173
pause
