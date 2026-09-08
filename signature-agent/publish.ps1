[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [string]$OutputDirectory = "$PSScriptRoot\artifacts\win-x64",
    [string]$Dotnet = "D:\FROTAS\.toolchains\dotnet\dotnet.exe",
    [switch]$RequireAuthenticode
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $Dotnet)) {
    throw "SDK .NET 10 não encontrado em '$Dotnet'."
}

$project = Join-Path $PSScriptRoot "FrotaSigner.Hml\FrotaSigner.Hml.csproj"
& $Dotnet publish $project `
    --configuration $Configuration `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:PublishDir="$OutputDirectory\"
if ($LASTEXITCODE -ne 0) { throw "Falha ao publicar FrotaSigner-HML." }

$executable = Join-Path $OutputDirectory "FrotaSigner-HML.exe"
if (-not (Test-Path -LiteralPath $executable)) { throw "Executável publicado não encontrado." }
$signature = Get-AuthenticodeSignature -LiteralPath $executable
if ($RequireAuthenticode -and $signature.Status -ne "Valid") {
    throw "O executável não possui assinatura Authenticode válida: $($signature.Status)."
}

$hash = Get-FileHash -LiteralPath $executable -Algorithm SHA256
[ordered]@{
    file = (Split-Path $hash.Path -Leaf)
    sha256 = $hash.Hash.ToLowerInvariant()
    authenticode = $signature.Status.ToString()
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory "manifest.json") -Encoding UTF8

Write-Host "FrotaSigner-HML publicado: $executable" -ForegroundColor Green
