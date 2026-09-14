@echo off
cd /d "%~dp0"
call uv run --extra model python -m uvicorn cleanroom.serve.api:app --host 127.0.0.1 --port 8000
pause
