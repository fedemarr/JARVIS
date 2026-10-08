$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $taskRoot 'desktop-agent/start.ps1') | Out-Null
$taskChrome = Join-Path ${env:ProgramFiles} 'Google/Chrome/Application/chrome.exe'
if (-not (Test-Path -LiteralPath $taskChrome)) {
    $taskChrome = Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe'
}
if (-not (Test-Path -LiteralPath $taskChrome)) { throw 'Se requiere Google Chrome para conservar la voz de Jarvis.' }
$taskProfile = Join-Path $taskRoot 'data/jarvis-desktop-browser'
New-Item -ItemType Directory -Path $taskProfile -Force | Out-Null
Start-Process -FilePath $taskChrome -ArgumentList @(
    "--user-data-dir=`"$taskProfile`"",
    '--app=https://jarvis-eta-blue.vercel.app/?desktop=1',
    '--no-first-run', '--no-default-browser-check', '--force-renderer-accessibility',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1440,960'
)
