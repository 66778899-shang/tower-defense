@echo off
REM One-click launcher for Windows: starts a local server and opens the game.
REM The game itself needs no build step, but serving over http:// keeps
REM localStorage (saves / achievements / map editor) working reliably.

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python not found in PATH.
  echo     You can still play by opening index.html directly in a browser.
  pause
  exit /b
)

start "" python -m http.server 8123 --bind 127.0.0.1
timeout /t 2 >nul
start "" http://127.0.0.1:8123/index.html
