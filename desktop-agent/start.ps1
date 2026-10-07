$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEntry = Join-Path $taskRoot 'backend/dist/backend/src/desktop/start.js'
if (-not (Test-Path -LiteralPath $taskEntry)) { throw 'Primero ejecutá npm run build desde la carpeta de Jarvis.' }
if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) {
    Write-Output 'El puerto 3002 ya está en uso. Si Jarvis Desktop está encendido, abrí http://127.0.0.1:3002.'
    exit
}
$taskNode = (Get-Command node).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @($taskEntry) -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'data/desktop.stdout.log') -RedirectStandardError (Join-Path $taskRoot 'data/desktop.stderr.log') -PassThru
[System.IO.File]::WriteAllText((Join-Path $taskRoot 'data/desktop-process-id.txt'), [string]$taskProcess.Id)
Write-Output 'Jarvis Desktop iniciado: http://127.0.0.1:3002'
