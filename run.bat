@echo off
echo ============================================
echo   ANTARDRISHTI - Backend Server
echo ============================================

if not exist .venv (
    echo ERROR: Virtual environment not found. Run setup.bat first.
    pause
    exit /b 1
)

call .venv\Scripts\activate

echo Starting server at http://127.0.0.1:8000
echo API docs at    http://127.0.0.1:8000/docs
echo Press Ctrl+C to stop.
echo.

python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
