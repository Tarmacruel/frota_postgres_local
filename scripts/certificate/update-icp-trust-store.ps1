[CmdletBinding()]
param(
    [string]$Destination = "D:\FROTAS\frota_certificado_homologacao\.runtime-secure\trust\icp-brasil"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedRepo = "D:\FROTAS\frota_certificado_homologacao"
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $expectedRepo ".runtime-secure"))
$destinationFull = [IO.Path]::GetFullPath($Destination)
if (-not $destinationFull.StartsWith($runtimeRoot + "\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "O trust store deve permanecer dentro do runtime criptografado: $runtimeRoot"
}

$mount = Get-Volume -FilePath $runtimeRoot -ErrorAction SilentlyContinue
if (-not $mount) { throw "O VHDX criptografado não está montado em $runtimeRoot." }

$anchors = @(
    [pscustomobject]@{
        File = "ICP-Brasilv4.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv4.crt"
        Sha256 = "857ff3bf31628979e479c5bc0bdf3e706bcc7bafb7ddf0c1134fc21f1cfab141"
        CommonName = "Autoridade Certificadora Raiz Brasileira v4"
    },
    [pscustomobject]@{
        File = "ICP-Brasilv5.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv5.crt"
        Sha256 = "5bd85f219695dabe6cf3d4bd713d9bd8e41b2323194022acf1acd658daef148a"
        CommonName = "Autoridade Certificadora Raiz Brasileira v5"
    },
    [pscustomobject]@{
        File = "ICP-Brasilv6.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv6.crt"
        Sha256 = "a91e45782e58755dffc6621cb05c2342db74398ffc6e930b0b3a23325a3bfdfd"
        CommonName = "Autoridade Certificadora Raiz Brasileira v6"
    },
    [pscustomobject]@{
        File = "ICP-Brasilv7.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv7.crt"
        Sha256 = "4fe1d8599fc00f0b61b12391c98d97af36bcada115bd894f8755e01e212bc4be"
        CommonName = "Autoridade Certificadora Raiz Brasileira v7"
    },
    [pscustomobject]@{
        File = "ICP-Brasilv12.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv12.crt"
        Sha256 = "ce6c66c73e41b12881ea8a9b8cb7efef9a482ea012c3cd3b843667e37a7a145c"
        CommonName = "Autoridade Certificadora Raiz Brasileira v12"
    },
    [pscustomobject]@{
        File = "ICP-Brasilv13.crt"
        Url = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv13.crt"
        Sha256 = "da54711b5816a2487903c62de28402dca2eea21ccc4e977f1d2645486d84d30c"
        CommonName = "Autoridade Certificadora Raiz Brasileira v13"
    }
)

$staging = Join-Path ([IO.Path]::GetTempPath()) "frota-icp-roots-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    $manifest = @()
    foreach ($anchor in $anchors) {
        $target = Join-Path $staging $anchor.File
        Invoke-WebRequest -UseBasicParsing -Uri $anchor.Url -OutFile $target
        $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne $anchor.Sha256) {
            throw "Hash inesperado para $($anchor.File)."
        }
        $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
            [IO.File]::ReadAllBytes($target)
        )
        if ($certificate.Subject -ne $certificate.Issuer -or $certificate.Subject -notlike "CN=$($anchor.CommonName),*") {
            throw "Identidade inesperada para $($anchor.File)."
        }
        $manifest += [ordered]@{
            file = $anchor.File
            source = $anchor.Url
            sha256 = $hash
            thumbprint = $certificate.Thumbprint.ToLowerInvariant()
            subject = $certificate.Subject
            notAfter = $certificate.NotAfter.ToUniversalTime().ToString("o")
        }
    }

    New-Item -ItemType Directory -Path $destinationFull -Force | Out-Null
    foreach ($anchor in $anchors) {
        Copy-Item -LiteralPath (Join-Path $staging $anchor.File) -Destination (Join-Path $destinationFull $anchor.File) -Force
    }
    [ordered]@{
        source = "Instituto Nacional de Tecnologia da Informação"
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
        anchors = $manifest
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destinationFull "manifest.json") -Encoding UTF8
}
finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
}

Write-Host "Âncoras ICP-Brasil instaladas e verificadas em $destinationFull" -ForegroundColor Green
