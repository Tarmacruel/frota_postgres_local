# HOTFIX — Cadastro de manutenção do Frota PMTF

## Objetivo

Corrigir o erro HTTP 500 ao registrar uma nova manutenção.

A correção elimina o acesso a `record.vehicle` durante a criação do registro, pois essa relação SQLAlchemy ainda não está carregada nesse ponto do fluxo assíncrono. O veículo consultado previamente passa a ser reutilizado para formar o rótulo do log de auditoria.

## Arquivo de aplicação alterado

`backend/app/services/maintenance_service.py`

Não há:
- alteração de schema;
- nova migration Alembic;
- alteração de frontend;
- alteração de dependências.

## Aplicação rápida

Abra PowerShell no diretório deste pacote.

### Opção A — um comando, com reinício

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\instalar_hotfix_manutencao.ps1 -RepoRoot "Z:\FROTAS\frota_postgres_local" -Restart
```

Esse comando:
1. cria backup do arquivo atual;
2. copia a versão corrigida;
3. valida a sintaxe Python;
4. para o Frota;
5. inicia novamente em modo de produção, sem build de frontend e sem seed.

### Opção B — instalar agora e reiniciar manualmente depois

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\instalar_hotfix_manutencao.ps1 -RepoRoot "Z:\FROTAS\frota_postgres_local"
```

Nesse caso, **não execute o instalador novamente só para reiniciar**. Use os comandos da seção "Reinício manual recomendado", evitando criar um segundo backup desnecessário.

## Reinício manual recomendado

```powershell
cd "Z:\FROTAS\frota_postgres_local"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\stop-dev.ps1" -Port 80

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\start-dev.ps1" `
  -Port 80 `
  -AppHost "127.0.0.1" `
  -Production `
  -BuildFrontend:$false `
  -SeedDemoData:$false
```

O uso de `-BuildFrontend:$false` é intencional: o hotfix altera somente o backend.
O uso de `-SeedDemoData:$false` é intencional: evita executar seed durante uma intervenção em produção.

## Validação após o reinício

### 1. Healthcheck

No servidor:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health
```

A resposta deve indicar HTTP 200.

### 2. Verificar portas

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 80,8000
```

Devem existir listeners nas portas 80 e 8000 no modo de produção atual.

### 3. Teste funcional

No Frota:
1. abra **Manutenções**;
2. cadastre uma manutenção de teste válida;
3. confirme que a mensagem de sucesso aparece;
4. confirme que o registro aparece na listagem;
5. se o registro for apenas teste, exclua-o conforme a regra operacional aplicável.

## Logs

Em caso de falha:

```powershell
Get-Content "Z:\FROTAS\frota_postgres_local\storage\logs\frota-app.err.log" -Tail 100
Get-Content "Z:\FROTAS\frota_postgres_local\storage\logs\frota-app.log" -Tail 100
```

Se os nomes dos logs forem diferentes no ambiente, use:

```powershell
Get-ChildItem "Z:\FROTAS\frota_postgres_local\storage\logs" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 Name, LastWriteTime, Length
```

## Rollback

O instalador salva o arquivo anterior em:

`storage\hotfix-backups\maintenance_service.py.<data-hora>.bak`

Para restaurar o backup mais recente:

```powershell
.\rollback_hotfix_manutencao.ps1 -RepoRoot "Z:\FROTAS\frota_postgres_local"
```

Depois reinicie manualmente, ou use:

```powershell
.\rollback_hotfix_manutencao.ps1 -RepoRoot "Z:\FROTAS\frota_postgres_local" -Restart
```

## Git

Após confirmar a correção em produção, registre a alteração no repositório para impedir que um futuro `git pull` reverta ou conflite com o hotfix.

Antes de qualquer checkout, confirme a branch ativa:

```powershell
cd "Z:\FROTAS\frota_postgres_local"
git branch --show-current
git status
```

Não troque de branch durante o hotfix sem confirmar qual branch é a utilizada em produção.
