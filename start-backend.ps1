$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot 'backend')
if (!(Test-Path '.venv')) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
