@echo off
setlocal enabledelayedexpansion
title ANTARDRISHTI - Network-Blockchain Investigation Platform

echo.
echo  ============================================================
echo        A N T A R D R I S H T I
echo        Network-Blockchain Investigation Platform
echo  ============================================================
echo.

:: ---------------------------------------------------------------
:: 1. PREFLIGHT CHECKS
:: ---------------------------------------------------------------

:: --- Check Python ---
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is NOT installed or not in PATH.
    echo         Download from https://www.python.org/downloads/
    echo         Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYTHON_VER=%%v
echo [OK] %PYTHON_VER% found.

:: --- Check Node.js (for frontend) ---
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Node.js is NOT installed or not in PATH.
    echo        The frontend dashboard will NOT start.
    echo        Download from https://nodejs.org/ if you need the dashboard.
    echo        Backend will still run.
    echo.
    set "HAS_NODE=0"
) else (
    for /f "tokens=*" %%n in ('node --version 2^>^&1') do set NODE_VER=%%n
    echo [OK] Node.js !NODE_VER! found.
    set "HAS_NODE=1"
)

echo.

:: ---------------------------------------------------------------
:: 2. PYTHON VIRTUAL ENVIRONMENT
:: ---------------------------------------------------------------

if not exist ".venv\Scripts\activate.bat" (
    echo [SETUP] Creating Python virtual environment...
    python -m venv .venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
    echo.

    :: Activate
    call .venv\Scripts\activate.bat

    :: Upgrade pip
    echo [SETUP] Upgrading pip...
    python -m pip install --upgrade pip -q
    if !errorlevel! neq 0 (
        echo [WARN] pip upgrade failed, continuing anyway...
    )

    :: Install from requirements.txt
    echo [SETUP] Installing Python dependencies from requirements.txt...
    echo         This may take a few minutes on first run.
    pip install -r requirements.txt -q
    if !errorlevel! neq 0 (
        echo [ERROR] Dependency installation failed.
        echo         Check requirements.txt and your internet connection.
        pause
        exit /b 1
    )
    echo [OK] All Python dependencies installed.
    echo.
) else (
    echo [OK] Virtual environment already exists.
    call .venv\Scripts\activate.bat
)

:: ---------------------------------------------------------------
:: 3. VERIFY CRITICAL IMPORTS
:: ---------------------------------------------------------------
echo [CHECK] Verifying critical packages...
python -c "import fastapi, uvicorn, polars, duckdb, sklearn, networkx" 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Some packages are missing. Reinstalling from requirements.txt...
    pip install -r requirements.txt -q
    if !errorlevel! neq 0 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)
echo [OK] Core packages verified.
echo.

:: ---------------------------------------------------------------
:: 4. CREATE .env IF MISSING
:: ---------------------------------------------------------------
if not exist ".env" (
    if exist ".env.example" (
        echo [SETUP] Creating .env from .env.example...
        copy .env.example .env >nul
        echo [OK] .env created. Edit it to customize settings.
        echo.
    )
)

:: ---------------------------------------------------------------
:: 5. FRONTEND SETUP (npm install if needed)
:: ---------------------------------------------------------------
if "!HAS_NODE!"=="1" (
    if not exist "frontend-next\node_modules" (
        echo [SETUP] Installing frontend dependencies...
        pushd frontend-next
        call npm install
        if !errorlevel! neq 0 (
            echo [WARN] npm install failed. Frontend will not start.
            set "HAS_NODE=0"
        ) else (
            echo [OK] Frontend dependencies installed.
        )
        popd
        echo.
    )
)

:: ---------------------------------------------------------------
:: 6. LAUNCH
:: ---------------------------------------------------------------
echo ============================================================
echo   STARTING SERVICES
echo ============================================================
echo.
echo   Backend API:   http://127.0.0.1:8000
echo   API Docs:      http://127.0.0.1:8000/docs
echo   Sample Run:    http://127.0.0.1:8000/api/sample
if "!HAS_NODE!"=="1" (
    echo   Dashboard:     http://localhost:3000
)
echo.
echo   Press Ctrl+C to stop all services.
echo ============================================================
echo.

:: --- Start frontend in background (if Node.js available) ---
if "!HAS_NODE!"=="1" (
    echo [START] Launching frontend on port 3000...
    start "ANTARDRISHTI-Frontend" /D "%~dp0frontend-next" cmd /c "npm run dev"
)

:: --- Auto-open browser in background ---
if "!HAS_NODE!"=="1" (
    echo [OPEN] Opening dashboard in browser at http://localhost:3000...
    start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
) else (
    echo [OPEN] Opening API docs in browser at http://127.0.0.1:8000/docs...
    start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000/docs"
)

:: --- Start backend (foreground, so Ctrl+C stops it) ---
echo [START] Launching backend on port 8000...
echo.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

:: ---------------------------------------------------------------
:: 7. CLEANUP (runs after Ctrl+C stops uvicorn)
:: ---------------------------------------------------------------
echo.
echo [STOP] Backend stopped.

:: Kill the frontend window if it's still running
if "!HAS_NODE!"=="1" (
    echo [STOP] Closing frontend...
    taskkill /fi "WINDOWTITLE eq ANTARDRISHTI-Frontend*" /f >nul 2>&1
)

echo.
echo  All services stopped. Goodbye!
echo.
pause
