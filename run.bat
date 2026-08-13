@echo off
cd /d "%~dp0"
echo ========================================================
echo Starting SRT Transcreation Assistant (Tauri/React)
echo ========================================================
echo.
echo Running in Development mode. To build a standalone executable,
echo run "npm run tauri build" instead.
echo.
npm run tauri dev
pause
