[CmdletBinding()]
param(
    [string]$SourceRoot = "\\SAD61SVR001\licitacao.1\FROTAS\frota_runtime\backups",
    [string]$MirrorRoot = "C:\Users\078364\OneDrive\BACKUPS\FROTAS",
    [ValidateRange(1, 100)][int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Remove-OldBackups {
    param([Parameter(Mandatory = $true)][string]$Path)

    Get-ChildItem -LiteralPath $Path -Filter "frota-backup-*.tar.gz" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $RetentionCount |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            $hashPath = "$($_.FullName).sha256"
            if (Test-Path -LiteralPath $hashPath) {
                Remove-Item -LiteralPath $hashPath -Force
            }
        }
}

if (-not (Test-Path -LiteralPath $SourceRoot)) {
    throw "Diretorio de backups Docker nao encontrado: $SourceRoot"
}

Ensure-Directory -Path $MirrorRoot

$archives = Get-ChildItem -LiteralPath $SourceRoot -Filter "frota-backup-*.tar.gz" -File |
    Sort-Object LastWriteTime

foreach ($archive in $archives) {
    $destination = Join-Path $MirrorRoot $archive.Name
    $destinationHash = "$destination.sha256"
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive.FullName).Hash

    $copyRequired = -not (Test-Path -LiteralPath $destination)
    if (-not $copyRequired) {
        $copyRequired = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash -ne $sourceHash
    }

    if ($copyRequired) {
        Copy-Item -LiteralPath $archive.FullName -Destination $destination -Force
    }

    $mirrorHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
    if ($mirrorHash -ne $sourceHash) {
        throw "Checksum divergente no espelho OneDrive: $($archive.Name)"
    }

    Set-Content -LiteralPath $destinationHash -Value $sourceHash -Encoding ASCII
}

Remove-OldBackups -Path $MirrorRoot
Write-Host "Espelhamento OneDrive concluido. Arquivos verificados: $($archives.Count)." -ForegroundColor Green
