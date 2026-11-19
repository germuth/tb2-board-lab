@echo off
setlocal EnableDelayedExpansion
title TB2 Board Lab
cd /d "%~dp0"

set "PY_CMD="

where py >nul 2>&1
if %errorlevel%==0 (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
    if !errorlevel!==0 (
        set "PY_CMD=py -3"
    )
)

if not defined PY_CMD (
    where python >nul 2>&1
    if %errorlevel%==0 (
        python -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
        if !errorlevel!==0 (
            set "PY_CMD=python"
        )
    )
)

if not defined PY_CMD (
    where python3 >nul 2>&1
    if %errorlevel%==0 (
        python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
        if !errorlevel!==0 (
            set "PY_CMD=python3"
        )
    )
)

if not defined PY_CMD (
    echo.
    echo ==============================================================
    echo   Python 3.8+ is required to run TB2 Board Lab from source.
    echo ==============================================================
    echo.
    echo You can install Python in either of these two easy ways:
    echo.
    echo   1^) Quick install via Command Prompt / PowerShell:
    echo        winget install Python.Python.3.12
    echo.
    echo   2^) Download the official installer from python.org
    echo      ^(Be sure to check "Add python.exe to PATH" during setup^)
    echo.
    set /p "OPEN_DL=Open https://www.python.org/downloads/ in your browser now? [Y/n]: "
    if /i not "!OPEN_DL!"=="n" (
        start "" "https://www.python.org/downloads/"
    )
    echo.
    echo After installing Python, double-click "Start TB2 Board Lab.bat" again.
    echo.
    pause
    exit /b 1
)

echo.
echo ==============================================================
echo   Starting TB2 Board Lab...
echo   Your browser will open automatically.
echo   Keep this window open while using the app ^(Ctrl+C to stop^).
echo ==============================================================
echo.

%PY_CMD% server.py --open-browser %*
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo TB2 Board Lab exited with error code %EXIT_CODE%.
    pause
)

endlocal
exit /b %EXIT_CODE%
