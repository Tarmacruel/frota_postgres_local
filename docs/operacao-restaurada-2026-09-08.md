# Frotas: operação restaurada em 08/09/2026

O endereço https://frota.sirel.com.br voltou a responder normalmente. Backend, interface, anexos, logs, rotinas e backups agora usam `D:\FROTAS\frota_certificado_homologacao`.

## Diagnóstico e correção

- A configuração `backend/.env` da instalação anterior em `C:\FROTAS\frota_runtime` estava corrompida, sem uma chave `DATABASE_URL` reconhecível. O backend encerrava na carga da configuração, causando HTTP 502 no acesso público.
- A configuração válida foi recuperada do backup de 05/09/2026, preservando os segredos de autenticação e de evidência das assinaturas. O banco de produção existente foi mantido; nenhum banco de homologação ou teste substituiu os dados reais.
- A rotina de atualização do `.env` foi corrigida para preservar arrays mesmo em arquivos com apenas uma linha, gravar UTF-8 sem BOM e evitar regravações sem alteração. A aplicação também aceita UTF-8 com BOM. Configuração sem banco agora interrompe o watchdog com diagnóstico explícito.
- A verificação HTTP do watchdog passou a tratar exceções sem a propriedade `Response`; falhas de saúde agora retornam código de erro ao Agendador.
- As correções mais recentes da instalação anterior para busca de condutores, limites da API, seletor remoto e seleção no cadastro de multas foram incorporadas. As alterações locais de certificado digital foram preservadas. O remoto Git foi consultado com `git fetch origin`; a referência `origin/main` continua em `6821e33`, já contida na base desta pasta (`6e5d354`).

## Configuração ativa

| Componente | Configuração |
| --- | --- |
| Backend | `backend`, Uvicorn em `127.0.0.1:8000` |
| Interface | `frontend/dist`, servidor em `127.0.0.1:3000`, proxy `/api` para o backend |
| Anexos | `data/uploads`, 186 arquivos copiados e conferidos por SHA-256 |
| Banco | PostgreSQL existente, `127.0.0.1:5432/frota_db`; serviço `postgresql-x64-16` |
| Túnel público | Serviço `Cloudflared` existente |
| Logs | `storage/logs` |
| Backup | `storage/backups`, espelho em `C:\Users\078364\OneDrive\BACKUPS\FROTAS` |

O PostgreSQL continua instalado em `C:\Program Files\PostgreSQL\16`, com seu diretório de dados existente. As dependências Python e Node continuam utilizando os executáveis já instalados no computador. A aplicação deixou de depender do runtime antigo e da pasta de rede.

## Retomada e backup automáticos

- `FROTA Watchdog Local`: conta **SYSTEM**, disparo 30 segundos após iniciar o Windows, repetição a cada minuto, sem necessidade de login. Executa `scripts/run-local-watchdog.ps1` nesta pasta, sem sincronizar código de outro caminho.
- `FROTA Backup Local`: conta **SYSTEM**, execução diária às **00h, 12h e 19h**, com recuperação de execução perdida. Executa `scripts/run-local-backup-automatico.ps1` nesta pasta; retenção de 10 arquivos por destino.
- PostgreSQL e Cloudflared têm início automático e recuperação por reinício após 20, 60 e 120 segundos em caso de falha.
- `FROTA_Iniciar.bat` executa a recuperação local e abre o endereço público. Os atalhos de configuração e a central operacional usam as novas rotinas. Para registrar novamente as tarefas como SYSTEM, execute `scripts/install-local-autostart.ps1` como administrador.

## Validação realizada

- Build de produção concluído; dependências Python compatíveis com todos os requisitos fixados; `pip check` e `npm ls` sem erros.
- Suíte backend: **301 testes aprovados, 19 ignorados**. Após adicionar a regressão de BOM, o conjunto de configuração e segurança passou em **20 testes**, incluindo o novo caso.
- Suíte frontend: **85 testes aprovados**. O teste adicional recuperado de busca remota de condutores também passou; execução dirigida de condutores e assinaturas: **8 testes aprovados**.
- Regressão PowerShell: configuração de uma linha preservada e atualizações repetidas sem regravação.
- ESLint: **0 erros, 46 avisos** preexistentes; não impedem a compilação.
- Migração `0042_feature_guides` → `0043_certificate_foundation` aplicada após dump prévio. Leitura de todos os **46 modelos/tabelas** em transação somente leitura confirmou a compatibilidade do esquema.
- Contagens preservadas: **36 usuários, 252 veículos, 255 condutores, 354 ordens de abastecimento e 4 assinaturas**.
- HTTP público: `/login`, `/api/health` e `/api/health/ready` retornaram **200**. A prontidão confirmou `database=ok`. Rotas protegidas sem sessão retornaram **401**, conforme esperado. Uma tentativa com usuário de teste inexistente consultou o banco e retornou 401, sem 502.
- Tela pública conferida no navegador e registrada em `output/playwright/frota-restaurado-20260908.png`.
- Recuperação efetivamente testada: os processos de backend e interface foram encerrados e recriados pela tarefa SYSTEM; saúde local e pública voltou a ficar positiva. As tarefas de watchdog e backup terminaram com **LastTaskResult=0**. O computador não foi reiniciado durante a intervenção.
- Backup completo executado também pelo Agendador como SYSTEM; ZIP verificado e cópia de espelho conferida por SHA-256.

## Backups e limites da verificação

- Dump anterior à migração: `storage/migration-20260908/frota-before-migration.dump`.
- Configuração antiga, exportação das tarefas e versões anteriores dos arquivos incorporados: `storage/migration-20260908` (pasta ignorada pelo Git).
- Backup completo final: `storage/backups/frota-backup-20260908-083531.zip` ou o arquivo mais recente da pasta; consultar `storage/logs/frota-backup-automatico.log` para os horários de conclusão.
- A assinatura ICP-Brasil mantém as flags de produção desativadas. O código de homologação e a estrutura de banco foram preservados; habilitar o fluxo real depende da configuração própria de certificado, agente, cadeia de confiança e TSA.
- Não foi realizada entrada com a senha de um usuário real nem cadastro de registros de produção para teste. Os 19 testes ignorados não foram apresentados como aprovados.
- O navegador ainda registra o bloqueio, pela CSP, do script de métricas Cloudflare Insights; isso não impediu o carregamento nem os testes da API. A configuração de métricas não foi alterada.
