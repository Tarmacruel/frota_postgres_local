# ExecPlan — Publicação das melhorias de etiquetas, mobile e CNH

## Objetivo
Publicar o conjunto já validado em homologação, autorizado expressamente pelo usuário em 22/10/2026: “agora aplique tudo na produção”. Inclui etiquetas, tour por conta, paleta com 12 cores e prévia, exclusão com histórico, experiência mobile e avisos de regularização da CNH. As fotos de encerramento já estão publicadas pelo PR #70.

## Estado inicial verificado
- Produção: `D:/FROTAS/frota_certificado_homologacao`, main, HEAD `1398835e4b2de380ae0923555c40920e8504825a`, checkout limpo, schema 0053.
- Homologação: `D:/FROTAS/frota_emprestimos_testes`, feature/vehicle-tags-hml, HEAD `6104f1d`, alterações das seis fases concluídas e documentadas.
- Deploy automático do GitHub desabilitado; serviços locais permanecem sob o watchdog de produção. Cloudflared é compartilhado e não requer reinício.
- Baseline anterior: backend 672 aprovados/109 ignorados; frontend 370 aprovados e testes finais direcionados; lint sem erros e 40 avisos existentes. Reexecutar os gates sobre o candidato final.

## Arquivos previstos
Fontes e testes das fases registradas nos seis EXECPLANs de 21/10, duas migrations 0054/0055, documentação e status. Excluir configurações, credenciais, bancos, uploads, fixtures e artefatos da homologação do Git e da publicação. Scripts e evidências operacionais ficam em backup privado local.

## Alterações funcionais proibidas
Não mudar status dos veículos, permissões, contratos de assinatura ou regras de posse/abastecimento. Avisos de CNH são informativos. Não transferir dados de homologação. Não gravar cadastros ou operações fictícias em produção para testes. Preservar configurações de produção e tabelas existentes.

## Passos de implementação
1. Conferir diff, dependências, gates locais e backup consistente do banco, configurações, anexos, build e Git.
2. Commit e PR para main, aguardar backend-tests/frontend-tests/container-smoke e merge pelas proteções existentes.
3. Exportar candidato e construir com os arquivos de ambiente próprios de produção; conferir identidade da árvore do merge com o candidato validado.
4. Suspender brevemente watchdog, parar somente API 8000, tirar dump final e fingerprints das tabelas existentes, fast-forward main e migrar até 0055.
5. Conferir integridade das linhas existentes antes de reabrir a API, iniciar API e publicar assets antes da troca atômica do index. Reativar watchdog em finally.
6. Conferir readiness, hashes públicos dos assets, endpoints autenticados em transação somente leitura, ausência dos dados de homologação e UI real.

## Validação visual
Conferir sessão de produção, tour, catálogo/paleta, CNH e navegação mobile; temas claro/escuro. Abrir/cancelar formulários sem salvar dados reais. Preservar a guia de trabalho original do usuário.

## Testes e build
Backend pytest no diretório backend; frontend vitest completo, lint e build. CI obrigatório e smoke com migrations em PostgreSQL descartável. Resultado e logs serão registrados no backup e no relatório de publicação.

## Resultado
Preparação em andamento. Nenhuma alteração operacional em produção nesta etapa inicial.

## Pendências / decisões
Autorização de produção recebida. Apenas migrations aditivas 0054/0055; número da CNH já faz parte do banco existente. O tour será apresentado aos usuários que ainda não o concluíram. Não reiniciar PostgreSQL, Cloudflare nem homologação.

## Rollback
Backup privado em `storage/backups/20261022-etiquetas-mobile-cnh` da produção. Em falha de ativação, restaurar versão e index anteriores e reiniciar API, mantendo schema aditivo. Nunca restaurar banco automaticamente ou fazer downgrade após novas gravações; preservar dados e histórico. Reativar watchdog mesmo em falha.
