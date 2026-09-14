@echo off
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  echo uv is missing. Install uv and reopen this window.
  pause
  exit /b 1
)
call uv sync --python 3.12 --extra model
if errorlevel 1 (
  echo Python setup failed. Read the error above.
  pause
  exit /b 1
)
cd web
call npm ci
if errorlevel 1 (
  echo Frontend setup failed. Read the error above.
  pause
  exit /b 1
)
echo Setup complete. Run START-BACKEND.cmd and START-FRONTEND.cmd separately.
pause
