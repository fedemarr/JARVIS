$ErrorActionPreference = 'Stop'
$taskLauncher = Join-Path $PSScriptRoot 'start.ps1'
$taskStartup = [Environment]::GetFolderPath('Startup')
$taskLink = Join-Path $taskStartup 'Jarvis Background Agent.lnk'
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut($taskLink)
$taskPowerShell = (Get-Command powershell.exe).Source
$taskArguments = '-NoProfile -WindowStyle Hidden -File "' + $taskLauncher + '"'
if ((Test-Path -LiteralPath $taskLink) -and ($taskShortcut.TargetPath -ne $taskPowerShell -or $taskShortcut.Arguments -ne $taskArguments)) {
    throw 'Ya existe un acceso de inicio con ese nombre y otra configuración. No se reemplazó.'
}
$taskShortcut.TargetPath = $taskPowerShell
$taskShortcut.Arguments = $taskArguments
$taskShortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$taskShortcut.Description = 'Conector de proyectos y voz de Jarvis en segundo plano, solo lectura.'
$taskShortcut.Save()
Write-Output 'El conector de Jarvis iniciará en segundo plano al entrar a Windows.'
