$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskOutput = Join-Path $taskRoot 'data/windows-app'
$taskExe = Join-Path $taskOutput 'Jarvis.exe'
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $taskCompiler)) { throw 'Se requiere .NET Framework de Windows.' }
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
if (Get-Process Jarvis -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $taskExe }) {
    throw 'Sali de Jarvis desde su icono junto al reloj antes de actualizarlo.'
}
& $taskCompiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Management.dll "/out:$taskExe" (Join-Path $PSScriptRoot 'Jarvis.cs')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar Jarvis.' }
$taskShell = New-Object -ComObject WScript.Shell
foreach ($taskFolder in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('Programs'))) {
    $taskLink = $taskShell.CreateShortcut((Join-Path $taskFolder 'Jarvis.lnk'))
    $taskLink.TargetPath = $taskExe
    $taskLink.Arguments = ''
    $taskLink.WorkingDirectory = $taskRoot
    $taskLink.WindowStyle = 7
    $taskLink.Hotkey = '' # The running app owns Ctrl+Alt+J.
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
Start-Process -FilePath $taskExe
