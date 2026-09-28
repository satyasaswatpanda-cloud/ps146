@echo off
echo ============================================
echo   ANTARDRISHTI - Setup
echo ============================================
echo.

if exist .venv (
    echo [*] Virtual environment already exists, skipping creation.
) else (
    echo [1/3] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment. Is Python installed?
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate

echo [2/3] Upgrading pip...
python -m pip install --upgrade pip -q

echo [3/3] Installing dependencies (this may take a few minutes)...
pip install numpy -q
pip install scikit-learn fastapi "uvicorn[standard]" python-multipart polars duckdb pydantic shap networkx matplotlib -q
pip install catboost mlflow neo4j pytest -q

if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup complete! Run: run.bat
echo ============================================
pause
