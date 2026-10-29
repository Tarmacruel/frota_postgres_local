[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$releaseRoot='D:\FROTAS\frota_emprestimos_testes'
$releaseFolder=Join-Path $releaseRoot 'storage\backups\20261029-superuser-settings'
$releasePython=Join-Path $releaseRoot 'backend\.venv\Scripts\python.exe'
$releaseScript=Join-Path $releaseRoot 'scripts\homologation\publish_superuser.py'
$releaseBranch='feature/superuser-settings-hml-20261029'
$stableBranch='fix/login-simple-hml-20261029'
$switched=$false
$resultCode=1
try {
    $currentBranch=(& git -C $releaseRoot branch --show-current).Trim()
    if ((& git -C $releaseRoot status --porcelain)) { throw 'Há alterações locais; confira antes de publicar.' }
    if ($currentBranch -ne $releaseBranch) {
        if ($currentBranch -ne $stableBranch -or (& git -C $releaseRoot rev-parse --short HEAD).Trim() -ne 'dde414d') { throw 'Base estável inesperada; nenhuma publicação iniciada.' }
        & git -C $releaseRoot switch $releaseBranch
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível carregar a entrega preparada.' }
        $switched=$true
    }
    $releaseRunner=Start-Process -FilePath $releasePython -ArgumentList @('-X','utf8',$releaseScript,'activate') -WorkingDirectory $releaseRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $releaseFolder 'activation.log') -RedirectStandardError (Join-Path $releaseFolder 'activation.err.log') -Wait -PassThru
    $resultCode=$releaseRunner.ExitCode
} finally {
    $releaseStatePath=Join-Path $releaseFolder 'release\state.json'
    if ($resultCode -ne 0 -and $switched -and (Test-Path -LiteralPath $releaseStatePath)) {
        $releaseState=Get-Content -LiteralPath $releaseStatePath -Raw | ConvertFrom-Json
        if ($releaseState.status -eq 'prepared' -and -not (& git -C $releaseRoot status --porcelain)) { & git -C $releaseRoot switch $stableBranch }
    }
    [ordered]@{finishedAt=(Get-Date).ToString('o');exitCode=$resultCode;environment='homologation';port=6969} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $releaseFolder 'activation-result.json') -Encoding UTF8
}
exit $resultCode
