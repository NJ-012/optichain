$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path 'node_modules')) { npm install }
& node .\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 3000
