@echo off
chcp 65001 >nul 2>&1
title TrustDrive - local server
cd /d "%~dp0"

echo.
echo   TrustDrive  -  starting BOTH runtimes
echo   ------------------------------------------------------------
echo   Web   : http://127.0.0.1:3000
echo   API   : http://127.0.0.1:8000/health
echo   Login : samarth@trustdrive.dev / demo1234
echo.
echo   Keep this window open while you use the site.
echo   Press Ctrl+C to stop both services.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [ERROR] Node.js was not found on PATH. Install Node 22+ and retry.
  pause
  exit /b 1
)

if not exist "frontend\.next\BUILD_ID" (
  echo   [setup] No production build found. Building once, this takes a minute...
  call npm run build
  if errorlevel 1 (
    echo   [ERROR] Build failed. See the output above.
    pause
    exit /b 1
  )
)

call npm run start:all
echo.
echo   Server stopped (exit code %errorlevel%).
pause
