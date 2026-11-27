[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = 'D:\FROTAS\frota_emprestimos_testes'
$base = '814f5eb1a043870b65806d0c5e31bdf8d53f45fd'
$revision = '0a1e624eea9d3982e62d4fe9b7427db917c9d992'
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$runtime = Join-Path $root 'scripts\loan_test_runtime.py'
$control = Join-Path $root 'scripts\loan-tests.ps1'
$publish = Join-Path $root 'scripts\publish-homologation-frontend.ps1'
$envFile = Join-Path $root 'backend\.env'
$index = Join-Path $root 'frontend\dist\index.html'
$geoDir = Join-Path $root 'storage\loan-tests\geoip'
$geoFile = Join-Path $geoDir 'dbip-city-lite-2026-11.mmdb'
$archive = Join-Path $geoDir 'dbip-city-lite-2026-11.mmdb.gz'

function Invoke-GitChecked {
    & git -C $root @args
    if ($LASTEXITCODE -ne 0) { throw "Git falhou na operacao $($args[0])." }
}

& $python $runtime validate
if ($LASTEXITCODE -ne 0) { throw 'Isolamento da homologacao nao confirmado.' }
$readiness = Invoke-RestMethod 'http://127.0.0.1:6969/api/health/ready' -TimeoutSec 5
if ($readiness.database -ne 'ok') { throw 'A homologacao precisa estar saudavel antes de aplicar.' }

# O fetch inicial baixa o commit e o instalador. O commit fixado impede copiar outras mudancas da branch.
Invoke-GitChecked cat-file -e "$revision^{commit}"
$paths = @(Invoke-GitChecked diff --name-only $base $revision)
$modified = @(Invoke-GitChecked diff --diff-filter=M --name-only $base $revision)
$added = @(Invoke-GitChecked diff --diff-filter=A --name-only $base $revision)
if ($paths.Count -eq 0 -or $paths.Count -ne ($modified.Count + $added.Count)) {
    throw 'O pacote deve conter somente arquivos novos ou modificados.'
}
if (@(Invoke-GitChecked diff --name-only $base HEAD -- @paths).Count -or
    @(Invoke-GitChecked status --porcelain --untracked-files=all -- @paths).Count) {
    throw 'Ha alteracoes locais nos arquivos da auditoria. A aplicacao foi interrompida antes de gravar.'
}
$originalEnv = [IO.File]::ReadAllBytes($envFile)
if ([Text.Encoding]::UTF8.GetString($originalEnv) -match '(?m)^\s*AUDIT_IP_CITY_MMDB\s*=') {
    throw 'A homologacao ja tem um caminho GeoIP configurado. Confira o valor antes da instalacao.'
}
$originalIndex = [IO.File]::ReadAllBytes($index)

& $python -m pip --disable-pip-version-check install 'maxminddb==3.0.0'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o leitor MMDB.' }
New-Item -ItemType Directory -Path $geoDir -Force | Out-Null
& curl.exe --fail --location --retry 2 --output $archive 'https://download.db-ip.com/free/dbip-city-lite-2026-11.mmdb.gz'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar a base DB-IP.' }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA1).Hash -ne 'A6F14E8DA5565C713CDDA9F1959A904B2EB88337') {
    throw 'A base baixada diverge do checksum publicado pelo DB-IP.'
}
$extract = 'import gzip, shutil, sys; a, b = sys.argv[1:]; shutil.copyfileobj(gzip.open(a, "rb"), open(b, "wb"))'
& $python -c $extract $archive "$geoFile.next"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair a base.' }
$validate = 'import maxminddb, sys; db = maxminddb.open_database(sys.argv[1]); assert db.get("8.8.8.8"); db.close()'
& $python -c $validate "$geoFile.next"
if ($LASTEXITCODE -ne 0) { throw 'A base MMDB extraida falhou na consulta de verificacao.' }
Move-Item -LiteralPath "$geoFile.next" -Destination $geoFile -Force

$codeTouched = $false
$restartAttempted = $false
try {
    $codeTouched = $true
    Invoke-GitChecked restore "--source=$revision" --worktree -- @paths
    [IO.File]::AppendAllText($envFile, "`r`nAUDIT_IP_CITY_MMDB=$($geoFile.Replace('\','/'))`r`n")
    & $publish
    $restartAttempted = $true
    & $control -Action stop
    & $control -Action start
    $ready = Invoke-RestMethod 'http://127.0.0.1:6969/api/health/ready' -TimeoutSec 5
    if ($ready.database -ne 'ok') { throw 'Backend reiniciado sem confirmar a prontidao.' }
    $page = Invoke-WebRequest -Uri 'http://127.0.0.1:6969/auditoria' -UseBasicParsing -TimeoutSec 5
    if ($page.StatusCode -ne 200) { throw 'A rota da auditoria nao respondeu.' }
} catch {
    $failure = $_
    if ($codeTouched) {
        Invoke-GitChecked restore --source=HEAD --worktree -- @modified
        foreach ($relative in $added) {
            $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
            if (!$target.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de reversao invalido.' }
            if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
        }
        [IO.File]::WriteAllBytes($envFile, $originalEnv)
        [IO.File]::WriteAllBytes($index, $originalIndex)
    }
    if ($restartAttempted) {
        try { & $control -Action stop } catch { Write-Warning $_.Exception.Message }
        & $control -Action start
    }
    throw $failure
}

Write-Output 'Auditoria de acessos aplicada em homologacao. Abra https://testefrota.sirel.com.br/auditoria com perfil Superusuario.'
