# Runbook — homologação de certificado digital

## Princípios operacionais

Execute estes procedimentos somente em `D:\FROTAS\frota_certificado_homologacao`, na branch `feature/certificado-digital-hml`. Os scripts recusam outro caminho ou branch. Não execute `FROTA_Iniciar.bat`, Cloudflared, watchdog ou rotinas gerais de backup nesse clone.

Operações de VHDX, BitLocker, ACL e tarefas agendadas exigem PowerShell elevado. A criação do VHDX e a instalação de tarefas são ações explícitas; use `-WhatIf` antes da primeira execução.

## Pré-requisitos

- clone independente no caminho fixo e commit base conferido;
- PowerShell 5.1 ou posterior;
- BitLocker; para VHDX, o script prefere o módulo Hyper-V PowerShell e usa `diskpart`/`Get-DiskImage` como fallback nativo;
- PostgreSQL server/client disponíveis localmente;
- Python 3.12, Node.js e npm;
- destino seguro da chave de recuperação fora de `D:` e fora do Git;
- backup de produção em uma das raízes de `productionBackupRoots` do JSON seguro.

## Estado operacional atual e limitações

O clone contém os scripts de provisionamento, montagem, start/stop/status, refresh e tarefas; o hook pós-refresh; o backend de assinatura; o frontend; e o agente Windows. O hook cria somente uma posse e uma ordem de abastecimento sintéticas e registra ambas na allowlist. A presença desses componentes não comprova que o ambiente privilegiado esteja provisionado.

Ainda exigem execução e evidência em máquina autorizada:

- criação efetiva do VHDX, ativação do BitLocker, guarda da recuperação, ACL e tarefas agendadas em PowerShell elevado;
- restauração integral de backup real, validação de contagens e arquivos, troca atômica e rollback;
- testes de TSA, CRL e OCSP reais, Authenticode, A3 físico, Adobe Reader, VALIDAR do ITI e E2E nos três navegadores.

Não marque esses gates somente porque o script, executável ou teste automatizado está presente no repositório.

## Provisionamento inicial

Em PowerShell elevado:

```powershell
Set-Location D:\FROTAS\frota_certificado_homologacao
powershell -NoProfile -File .\scripts\homologation\setup.ps1 `
  -ProvisionSecureVolume `
  -RecoveryKeyOutputPath E:\COFRE\frota-hml-bitlocker.txt `
  -WhatIf
```

Revise a saída e repita sem `-WhatIf`. O script não sobrescreve VHDX existente nem cria diretório de destino da chave silenciosamente. Depois, inicialize os segredos e o banco e reinstale as dependências:

```powershell
powershell -NoProfile -File .\scripts\homologation\setup.ps1 -InitializeRuntime
powershell -NoProfile -File .\scripts\homologation\setup.ps1 -InstallDependencies
```

O arquivo seguro `config\homologation.json` nasce do exemplo versionado. Revise a allowlist de backups dentro do volume criptografado antes do primeiro refresh. O exemplo usa o caminho UNC do servidor porque unidades mapeadas como `Z:` podem não existir no contexto elevado da tarefa. Nunca coloque senhas no JSON de exemplo do Git.

## Montagem após reinício

O instalador de tarefas cria uma tarefa de logon para a conta autorizada. Para montagem manual, use PowerShell elevado:

```powershell
powershell -NoProfile -File .\scripts\homologation\mount.ps1
```

O script usa material DPAPI do usuário que provisionou o volume. Outra conta não consegue descriptografá-lo.

## Primeira restauração e atualização manual

Pare a aplicação antes do refresh:

```powershell
powershell -NoProfile -File .\scripts\homologation\stop.ps1
powershell -NoProfile -File .\scripts\homologation\refresh.ps1
```

O worktree deve estar limpo e todo código deve estar commitado; isso vincula migrations e manifesto a um commit exato.

O refresh:

1. aceita somente raiz allowlisted;
2. exige arquivo `frota-backup-*.zip` com sidecar `.sha256.txt`;
3. valida idade, estabilidade, SHA-256, entradas e manifesto;
4. ignora `.env.backup` e extrai apenas `database.sql`, `metadata.json` e `storage\...`;
5. restaura `frota_hml_refresh_<timestamp>`, aplica Alembic e checa integridade;
6. executa o hook sintético versionado, que recria a posse e a ordem de abastecimento HML e suas entradas na allowlist; qualquer colisão com identificador reservado aborta o refresh;
7. troca banco e storage ativos, preservando somente a versão anterior;
8. grava manifesto e auditoria sem PII.

O hook de alvos sintéticos está implementado. Use `-RequireSyntheticTargets` nos ensaios de aceite para transformar ausência ou falha do hook em erro bloqueante. `CERTIFICATE_SIGNING_ENABLED` permanece falso por padrão e só deve ser habilitado durante um ensaio controlado, após confirmar no banco os dois alvos ativos e o isolamento do volume.

## Inicialização, estado e parada

```powershell
powershell -NoProfile -File .\scripts\homologation\start.ps1
powershell -NoProfile -File .\scripts\homologation\status.ps1
powershell -NoProfile -File .\scripts\homologation\status.ps1 -AsJson
powershell -NoProfile -File .\scripts\homologation\stop.ps1
```

O `start` não usa hot reload. Reinicie os serviços para aplicar código novo. O agente implementado é iniciado explicitamente com `start.ps1 -StartSignerAgent`; a opção exige o executável publicado em `signature-agent\artifacts\win-x64\FrotaSigner-HML.exe`. Não confunda build local sem Authenticode com binário aceito para promoção.

O `stop` encerra somente PIDs cujo executável/comando e diretório registrado pertencem ao clone. Se houver divergência, ele falha de forma segura; investigue pelo `status` em vez de matar processos globalmente.

## Atualização diária

Em PowerShell elevado, visualize e instale as tarefas:

```powershell
powershell -NoProfile -File .\scripts\homologation\install-refresh-task.ps1 -WhatIf
powershell -NoProfile -File .\scripts\homologation\install-refresh-task.ps1
```

São instaladas:

- `\FrotaPMTF\Frota-HML-Mount`, no logon do usuário autorizado;
- `\FrotaPMTF\Frota-HML-Refresh`, diariamente às 03:30.

As tarefas usam o token interativo da conta autorizada. Se essa conta não estiver conectada às 03:30, `StartWhenAvailable` executa a atualização no próximo logon; nenhuma senha Windows é armazenada. Se a homologação estiver em uso, a tarefa tenta novamente a cada 30 minutos até 06:00. Depois registra adiamento sem interromper testes. Instâncias concorrentes são recusadas.

## Evidências e diagnóstico

- logs: `.runtime-secure\logs`;
- auditoria JSONL: `.runtime-secure\logs\homologation-operations.jsonl`;
- último refresh: `.runtime-secure\refresh\last-success.json`;
- snapshot anterior: `.runtime-secure\snapshots\previous`;
- stdout/stderr dos serviços: `.runtime-secure\logs\*.log`.

Os logs não incluem senhas, URLs completas com credencial, nomes de usuários do negócio, CPF ou nomes de anexos individuais.

## Cadeia e material de revogação

`SIGNATURE_ALLOW_NETWORK_FETCHING=false` é o padrão e deve continuar assim durante os testes com material local. Certificados, CRLs e respostas de teste devem ser colocados somente no armazenamento seguro por procedimento controlado, com origem e SHA-256 registrados. Não habilite busca automática para contornar falha de cadeia ou revogação.

A validação com cadeia, CRL/OCSP e TSA reais ainda é um gate externo pendente. A indisponibilidade de qualquer material obrigatório deve encerrar a sessão sem PDF parcialmente assinado. Credenciais da ACT SERPRO pertencem à configuração segura e nunca ao Git ou aos logs.

## Rollback

O refresh tenta reverter automaticamente banco e storage se a troca falhar. Se a aplicação não subir depois de uma atualização:

1. mantenha os serviços parados;
2. guarde os logs e o manifesto;
3. confirme que a porta 5440 pertence ao cluster HML;
4. restaure `frota_hml_previous` e `.runtime-secure\snapshots\previous\uploads` somente conforme procedimento revisado por DBA;
5. não copie o snapshot para produção e não apague o VHDX.

Não há script automático de remoção do VHDX, da chave de recuperação ou dos dados. Essa ausência é intencional para evitar perda irrecuperável.
