# ExecPlan — Fase 9 — Condutores

## Objetivo

Entregar em HML uma análise rastreável por condutor, com posses, km válido, veículos, multas, sinistros, abastecimentos e anomalias, e CNH como indicador administrativo separado. Não apresentar score composto.

## Estado inicial verificado

- Branch `feature/analytics-evolution-hml`; HEAD `06888772fb45fac0df6762af270451d807043025`.
- `git status --short --branch` anterior à edição: árvore limpa, sincronizada com `origin/feature/analytics-evolution-hml`.
- Baseline registrado na Fase 8: backend 582 aprovados/96 pulados; PostgreSQL focado 11 aprovados; frontend 273 aprovados/56 arquivos; lint 0 erros/45 avisos existentes; build aprovado.
- Plano Analytics e arquivo da fase estão no pacote de origem, não na raiz. Instruções, status, especificação visual, contexto frontend e contact sheets lidos.

## Arquivos previstos

- Serviço/rotas/testes V2 de condutores e cliente API.
- Componente de Condutores/testes, integração na página Analytics e drawer compartilhado.
- Este plano e `11_STATUS.md`.

## Alterações funcionais proibidas

Sem produção, modelo, migration, edição de registro, regra operacional, V1, rotas existentes, autenticação, autorização ou exportação. Não atribuir ao condutor evento sem `driver_id`; não inferir culpa, risco individual, deslocamento contínuo nem resultado de CNH a partir de campos ausentes.

## Passos de implementação

1. Reaproveitar o recorte civil V2, o escopo organizacional histórico e a regra de km de posse válida; contabilizar apenas `driver_id` explícito.
2. Contar posses, veículos, multas, sinistros, abastecimentos e anomalias da regra fuel-v2.1; manter origem e cobertura documentadas.
3. Separar CNH atual/vencida/a vencer em 30 dias, limitada à permissão de leitura de condutores e sem misturar ao ranking de ocorrências.
4. Criar ranking ordenável por contagens absolutas e km; drawer com listas paginadas por fonte, registro de domínio quando existir, regra/amostra e navegação preservando filtros.
5. Desativar a apresentação do score legado opaco nesta seção e no drawer de condutor, sem alterar contrato V1.

## Validação visual

Inspecionar HML autenticada em claro/escuro desktop e celular, condutor → fonte → registro, Voltar/Escape, estados vazios, overflow e console. Salvar capturas.

## Testes e build

Testes focados de cálculo/escopo/permissão e PostgreSQL somente leitura; suíte backend; `npm run test`, `npm run lint`, `npm run build`, `git diff --check`.

## Resultado

Implementada somente em `feature/analytics-evolution-hml`; commit funcional `30a8a58`. A nova seção usa vínculos explícitos `driver_id` em posses, multas, sinistros e abastecimentos. Km segue a regra V2 de posse encerrada válida; anomalias usam a regra analítica existente `fuel-v2.1` e mostram regra, observado, referência e amostra no drawer. Ranking ordena colunas absolutas selecionáveis, sem score composto. CNH vencida/a vencer em 30 dias é um indicador administrativo do cadastro atual, exigindo `drivers:view`, sem integrar as ocorrências.

Os endpoints somente leitura `/api/analytics/v2/drivers` e `/drivers/{id}/events` preservam `analytics:view`, escopo histórico por secretaria, filtros civis V2 e permissões dos módulos de origem para listas individuais. O drawer conserva filtros, pilha, explicação e acesso ao registro de domínio quando existe. Registros sem `driver_id` ficam em cobertura separada; a V1 e os fluxos de edição foram preservados.

Verificação: backend completo **587 aprovados/97 pulados**; PostgreSQL HML somente leitura **14 aprovados**; frontend completo **277 aprovados/57 arquivos**; lint **0 erros/45 avisos preexistentes**; build e `git diff --check` aprovados. API local e pública HML com HTTP 200 e mesmos totais/9 hashes de assets no recorte 11/09–10/10/2026: 305 condutores no universo do administrador, 588 posses, 445 com km válido, 412.246,3 km. Multas/sinistros/abastecimentos vinculados e anomalias vinculadas: zero; 43 abastecimentos e 5 acionamentos de regra sem `driver_id` foram exibidos como lacuna de cobertura. Cinco subconjuntos do drawer responderam 200. Escopo de uma secretaria verificado com 41 condutores, 75 posses e 62 posses com km válido. Chromium autenticado: condutor → posse → registro → Voltar, claro/escuro desktop e escuro celular 390 px, sem overflow horizontal, console final 0 erros/0 avisos. Capturas em `output/playwright/analytics-phase-9/01-drivers-light-desktop.png` a `08-driver-drawer-dark-mobile.png`.

## Pendências / decisões

Sem score composto na nova seção ou no drawer; o contrato V1 anterior permanece intacto. Associação a condutor exige chave explícita; dados sem vínculo ficam fora dos totais individuais e aparecem na cobertura. Anomalia analítica é triagem, não culpa. Na amostra HML do recorte validado não há multas, sinistros ou abastecimentos ligados a condutores, por isso esses caminhos foram verificados com testes sintéticos e respostas vazias da API real. Validação funcional/visual pelo responsável permanece pendente.

## Rollback

Reverter apenas o commit específico da Fase 9 na branch de homologação.
