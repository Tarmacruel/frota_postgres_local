[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root='D:\FROTAS\frota_emprestimos_testes'
$envFile=Join-Path $root 'frontend\.env.homologation.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Configuracao propria de build HML ausente.' }
$content=Get-Content -LiteralPath $envFile -Raw
if ($content -notmatch '(?m)^VITE_APP_ENV=homologation\r?$' -or $content -notmatch '(?m)^VITE_HOMOLOGATION=true\r?$') { throw 'O build deve identificar explicitamente a homologacao.' }
& "$root\backend\.venv\Scripts\python.exe" "$root\scripts\loan_test_runtime.py" validate
if ($LASTEXITCODE -ne 0) { throw 'Isolamento nao confirmado.' }
$candidate=Join-Path $root 'storage\hml-frontend-build'
$dist=Join-Path $root 'frontend\dist'
& npm --prefix "$root\frontend" run build -- --mode homologation --outDir $candidate
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; frontend anterior preservado.' }
Get-ChildItem -LiteralPath $candidate | Where-Object {$_.Name -ne 'index.html'} | Copy-Item -Destination $dist -Recurse -Force
Copy-Item -LiteralPath "$candidate\index.html" -Destination "$dist\index.html.next" -Force
Move-Item -LiteralPath "$dist\index.html.next" -Destination "$dist\index.html" -Force
Write-Output 'Frontend de homologacao publicado. Nenhum servico de producao alterado.'
