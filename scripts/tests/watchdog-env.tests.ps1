$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts\frota-watchdog.ps1'), [ref]$null, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }
$functionAst = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Update-EnvFileValue' }, $true)
. ([scriptblock]::Create($functionAst.Extent.Text))
$testFile = Join-Path $root ('storage\runtime\watchdog-env-test-' + [guid]::NewGuid().ToString('N') + '.env')
try {
    # Reproduce the single-line input that used to concatenate subsequent keys.
    [IO.File]::WriteAllText($testFile, 'DATABASE_URL=postgresql://test@localhost/test', (New-Object Text.UTF8Encoding($false)))
    Update-EnvFileValue -Path $testFile -Name 'SECRET_KEY' -Value 'test-only'
    Update-EnvFileValue -Path $testFile -Name 'STORAGE_DIR' -Value 'D:\FROTAS\data\uploads'
    $lines = [IO.File]::ReadAllLines($testFile)
    if ($lines.Count -ne 3 -or $lines[0] -ne 'DATABASE_URL=postgresql://test@localhost/test' -or $lines[1] -ne 'SECRET_KEY=test-only') {
        throw 'A atualizacao perdeu ou concatenou configuracoes.'
    }
    $hash = (Get-FileHash -LiteralPath $testFile).Hash
    $modified = (Get-Item -LiteralPath $testFile).LastWriteTimeUtc
    1..3 | ForEach-Object { Update-EnvFileValue -Path $testFile -Name 'SECRET_KEY' -Value 'test-only' }
    if ((Get-FileHash -LiteralPath $testFile).Hash -ne $hash -or (Get-Item -LiteralPath $testFile).LastWriteTimeUtc -ne $modified) {
        throw 'O watchdog regravou uma configuracao que nao mudou.'
    }
    Write-Host 'PASS: configuracao de linha unica preservada e atualizacoes repetidas sem regravacao.'
} finally {
    Remove-Item -LiteralPath $testFile -Force -ErrorAction SilentlyContinue
}
