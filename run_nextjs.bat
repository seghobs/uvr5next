@echo off
setlocal enabledelayedexpansion
title UVR5 Next Studio Launcher

echo ===================================================
echo           UVR5 Next Studio (Next.js + TSX)
echo ===================================================
echo.

if exist "..\env\python.exe" (
    set "PYTHON_EXE=..\env\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [1/2] Checking Python Backend...
echo Using: !PYTHON_EXE!
echo.

echo [2/2] Launching Next.js Studio on http://localhost:3000...
echo.

cd frontend
npm run dev
pause
