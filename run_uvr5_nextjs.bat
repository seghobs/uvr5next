@echo off
setlocal enabledelayedexpansion
title UVR5 Next.js Studio Launcher
color 0B

echo =================================================================
echo             UVR5 Next.js Studio (TypeScript + TSX)
echo =================================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Determine Python executable
if exist "env\python.exe" (
    set "PYTHON_EXE=env\python.exe"
) else if exist "..\env\python.exe" (
    set "PYTHON_EXE=..\env\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [1/3] Python Backend: !PYTHON_EXE!
echo [2/3] Checking FastAPI Backend (:8000)...

:: Check if port 8000 is already active, if not launch backend in background
netstat -ano | findstr :8000 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo       Starting FastAPI Backend on http://localhost:8000...
    start "UVR5 Backend API" /min cmd /c "!PYTHON_EXE! api_modern.py"
    timeout /t 2 /nobreak >nul
) else (
    echo       FastAPI Backend is already running on http://localhost:8000.
)

echo.
echo [3/3] Starting Next.js Studio on http://localhost:3000...
echo.

:: 3. Open browser automatically after 2 seconds
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: 4. Start Next.js dev server
cd frontend
npm run dev

pause
