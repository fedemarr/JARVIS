$ErrorActionPreference = 'Stop'
$jarvisRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $jarvisRoot 'data/claude-runtime'
& npm.cmd install --prefix $runtimeRoot --no-audit --no-fund '@anthropic-ai/claude-code@2.1.293'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar el ejecutor privado de Claude Code.' }
& (Join-Path $runtimeRoot 'node_modules/@anthropic-ai/claude-code/bin/claude.exe') --version
