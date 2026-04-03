@echo off
REM DocMind - Start Both Servers WITH PROFILING
REM This script starts the Next.js frontend and Flask backend with profiling enabled

echo.
echo Starting DocMind Servers with PROFILING...
echo.

REM Start Flask backend with profiling using Python script
echo Starting Flask backend on http://localhost:5000 (PROFILING ENABLED)...
start "Flask Backend (Profiled)" cmd /k "cd /d %~dp0 && python run_profiled.py"

REM Give Flask a moment to start
timeout /t 2 /nobreak > nul

REM Start Next.js frontend in a new window
echo Starting Next.js frontend on http://localhost:3000...
start "Next.js Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting!
echo.
echo Frontend (Next.js): http://localhost:3000
echo Backend (Flask):    http://localhost:5000 (PROFILING ON)
echo.
echo PROFILING: .prof files will be saved to: profile_output\
echo To analyze: python analyze_profile.py --latest
echo.
echo Tip: Close both terminal windows to stop the servers.
pause
