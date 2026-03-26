@echo off
echo.
echo ====================================================
echo    EduLive - Auto Setup (Windows)
echo ====================================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not installed!
    echo Download from: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found!

:: Run setup script
node setup.js

pause
