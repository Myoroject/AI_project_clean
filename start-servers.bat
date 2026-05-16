@echo off
REM DocMind - Start Both Servers
REM This script starts the Vite frontend and Flask backend concurrently

echo.
echo Starting DocMind Servers...
echo.

REM Start Flask backend in a new window
echo Starting Flask backend on http://localhost:5000...
start "Flask Backend" cmd /k "cd /d %~dp0 && flask --app app run --port 5000 --debug"

REM Give Flask a moment to start
timeout /t 2 /nobreak > nul

REM Start Vite frontend in a new window
echo Starting Vite frontend on http://localhost:5173...
start "Vite Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting!
echo.
echo Frontend (Vite): http://localhost:5173
echo Backend (Flask):    http://localhost:5000
echo.
echo Tip: Close both terminal windows to stop the servers.
pause
