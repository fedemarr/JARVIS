$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskShell = New-Object -ComObject WScript.Shell
$taskLauncher = Join-Path $PSScriptRoot 'start.ps1'
foreach ($taskFolder in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Programs'))) {
    $taskLink = $taskShell.CreateShortcut((Join-Path $taskFolder 'Jarvis.lnk'))
    $taskLink.TargetPath = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $taskLink.Arguments = "-NoProfile -WindowStyle Hidden -File `"$taskLauncher`""
    $taskLink.WorkingDirectory = $taskRoot
    $taskLink.WindowStyle = 7
    $taskLink.Hotkey = 'CTRL+ALT+J'
    $taskLink.Description = 'Jarvis - asistente personal'
    $taskLink.Save()
}
$taskPrevious = Join-Path ([Environment]::GetFolderPath('Startup')) 'Jarvis Background Agent.lnk'
if (Test-Path -LiteralPath $taskPrevious) {
    $taskPreviousLink = $taskShell.CreateShortcut($taskPrevious)
    if ($taskPreviousLink.Arguments.Contains((Join-Path $taskRoot 'desktop-agent/start.ps1').Replace('/', '\'))) {
        Remove-Item -LiteralPath $taskPrevious
    }
}
Write-Output 'Jarvis instalado en Inicio, con inicio automatico y atajo Ctrl + Alt + J.'
& $taskLauncher
