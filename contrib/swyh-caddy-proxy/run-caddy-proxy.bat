@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Prefer caddy.exe next to this script (e.g. copy from https://caddyserver.com/download )
if exist "%~dp0caddy.exe" (
  "%~dp0caddy.exe" run --config "%~dp0Caddyfile"
) else (
  where caddy >nul 2>&1
  if errorlevel 1 (
    echo.
    echo [ERROR] Caddy not found.
    echo - Put caddy.exe in this folder, OR install Caddy and add it to PATH.
    echo - Download: https://caddyserver.com/download
    echo.
    pause
    exit /b 1
  )
  caddy run --config "%~dp0Caddyfile"
)

echo.
echo Caddy exited with code %ERRORLEVEL%.
pause
exit /b %ERRORLEVEL%
