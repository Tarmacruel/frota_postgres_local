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
Publicação inicial concluída pelo PR #71, merge `8158a24`, após os três checks obrigatórios. Gates locais: 672 testes backend aprovados/109 ignorados, 371 frontend, lint 0 erros/40 avisos existentes, build de produção concluído. Ativação entre 07:39:22 e 07:39:44 de 22/10/2026. Schema 0055; fingerprints de todas as 57 tabelas existentes idênticos durante a migração. Novas tabelas vazias, sem fixtures da homologação. Configurações preservadas, watchdog Ready, nove assets públicos com hashes idênticos, produção e homologação saudáveis e endpoints protegidos com 401 anônimo. Fotos históricas servidas e endpoints de consulta/CNH/tour conferidos em transação somente leitura.

Na QA visual de produção, o tour apareceu automaticamente e a paleta exibiu 12 opções com prévia. Foi identificado um ajuste necessário no CSS mobile: top fixo de 26px reservava a faixa de homologação mesmo quando ausente em produção, sobrepondo parcialmente o título. Corrigir somente o deslocamento da barra e do menu: 0px por padrão e 26px quando a faixa estiver presente. Aplicar primeiro em homologação, conferir nos dois ambientes e publicar por PR separado com checks. Sem alteração de backend ou nova migração.

Correção concluída pelo PR #72, merge `da64c60`, com os três checks aprovados. Publicação do frontend entre 07:45:53 e 07:45:54, sem reiniciar API. Conferência real: produção sem faixa com top 0px, cabeçalho terminando em 60,9px e título iniciando em 76,9px; homologação com faixa e cabeçalho em 26px. Nove assets finais verificados. CNH em criação, aviso na posse, link em nova aba, foco no campo Número da CNH e preservação do rascunho conferidos em produção sem salvar operações ou cadastros. Tema claro/escuro e navegação mobile conferidos. Apenas a confirmação do tour da conta de QA foi gravada. [Relatório final](PRODUCTION_FEATURES_RELEASE_20261022.md).

## Pendências / decisões
Autorização de produção recebida. Apenas migrations aditivas 0054/0055; número da CNH já faz parte do banco existente. O tour será apresentado aos usuários que ainda não o concluíram. Não reiniciar PostgreSQL, Cloudflare nem homologação.

## Rollback
Backup privado em `storage/backups/20261022-etiquetas-mobile-cnh` da produção. Em falha de ativação, restaurar versão e index anteriores e reiniciar API, mantendo schema aditivo. Nunca restaurar banco automaticamente ou fazer downgrade após novas gravações; preservar dados e histórico. Reativar watchdog mesmo em falha.
