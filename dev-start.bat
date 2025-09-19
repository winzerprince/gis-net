@echo off
REM ===================================================
REM GIS-NET Development Startup Script for Windows
REM Starts Frontend and Backend in Separate Command Windows
REM ===================================================

setlocal enabledelayedexpansion

echo [GIS-NET] Starting development environment...

REM Get the directory of this script
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend
set FRONTEND_DIR=%SCRIPT_DIR%frontend

REM Check if directories exist
if not exist "%BACKEND_DIR%" (
    echo [ERROR] Backend directory not found: %BACKEND_DIR%
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%" (
    echo [ERROR] Frontend directory not found: %FRONTEND_DIR%
    pause
    exit /b 1
)

REM Start backend in new window
echo [GIS-NET] Starting backend server...
start "GIS-NET Backend" cmd /k "cd /d "%BACKEND_DIR%" && echo Starting GIS-NET Backend API Server && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start frontend in new window
echo [GIS-NET] Starting frontend server...
start "GIS-NET Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && echo Starting GIS-NET React Development Server && npm start"

echo.
echo [GIS-NET] Development servers are starting...
echo.
echo Backend API:  http://localhost:4000
echo Frontend App: http://localhost:3000
echo.
echo Check the new command windows for server output
echo Press any key to exit this window...
pause >nul
