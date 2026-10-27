# ExecPlan — Ordens abertas dentro de Abastecimentos — 27/10/2026

## Objetivo
Integrar a operação de Ordens abertas como terceira área de Abastecimentos, sem segundo cabeçalho ou entrada lateral duplicada. Somente homologação. Preservar confirmação, vínculo contratual, comprovante, assinatura, prazos, filtros, KPIs e permissões atuais.

## Estado inicial verificado
- HML em79b5723, árvore limpa; branch anterior feature/fuel-workspace-compact-headers-hml-20261027. Nova branch feature/open-orders-fuel-tab-hml-20261027.
- Baseline:517 testes frontend/81 arquivos,41 direcionados finais, lint0 erros/39 avisos anteriores, build HML aprovado. Regras AGENTS, IMPLEMENT, PLANS e documentos visuais/status já lidos nesta conversa.
- FuelSupplyOrdersPage concentra toda a operação de confirmação/assinatura; FuelSuppliesPage contém as áreas Ordens/Histórico. A rota de Abastecimentos exige fuel_supplies:view, enquanto Ordens abertas exige fuel_supply_orders:view. Esses escopos distintos precisam continuar respeitados.
- Backup privado storage/backups/20261027-open-orders-tab: build/configurações e bundle Git anteriores. Nenhum reinício de API será necessário.

## Arquivos previstos
FuelSuppliesPage, FuelSupplyOrdersPage (modo incorporado), App (entrada usando permissões existentes e redirecionamento compatível), Layout (menu e links de assinatura), CSS de workspace e regressões. Sem dependência nova.

## Alterações funcionais proibidas
Sem backend, schema, cálculo financeiro, permissão concedida, cópia de dados, configuração ou publicação produtiva. Operadores sem fuel_supplies:view não poderão acessar histórico, listagem geral ou cadastros dessas áreas. As APIs mantêm sua autorização e escopo por posto/secretaria.

## Passos de implementação
1. [x] Inventariar rotas, permissões, estado e ações; branch e backup.
2. [x] Incorporar Ordens abertas, isolando seu indicador e preservando estado da consulta ao alternar.
3. [x] Consolidar navegação; adaptar endereço antigo preservando foco de assinatura/indicadores e acesso dos postos.
4. [x] Regressões, suíte completa frontend, lint e build candidato HML.
5. [ ] Publicar somente frontend, conferir desktop/mobile/claro/escuro, dados/PIDs/configurações e documentar.

## Validação visual
Tese: uma área de abastecimento com três consultas bem identificadas e uma única lista visível. Conteúdo: cabeçalho compacto, Ordens / Ordens abertas / Histórico, filtros e KPIs próprios, registro com próxima ação. No celular, priorizar as três áreas e transferir utilitários para o menu existente, evitando quebra do cabeçalho. Reutilizar foco, menu, diálogos e transições existentes, sem ornamentos.

## Testes e build
Testar perfil completo, somente histórico, somente ordens e sem acesso; não fazer chamadas de histórico/catálogos para postos sem permissão. Confirmar carregamento só da área ativa, preservação de busca/página, foco da assinatura após redirecionamento e separação de indicadores. Conferir confirmação/vínculo/assinaturas sem executar lançamentos reais no navegador. Testes de UI com APIs isoladas, suíte completa, lint e build --mode homologation fora de dist.

## Resultado
Pronta para publicação HML:528 testes/82 arquivos,67 direcionados finais em5 arquivos, lint0 erros/39 avisos anteriores e build HML aprovados. Abrange rota autenticada/autorizada, endereço antigo com foco/indicador/hash, três áreas, isolamento dos postos, preservação da consulta, confirmação e atualização apenas das abertas. Refinamento final limpa erro da área anterior ao navegar, com regressão específica; suíte direcionada, lint e build repetidos após esse ajuste. Nenhum arquivo de backend alterado.

## Pendências / decisões
- Abastecimentos poderá ser aberto usando qualquer uma das duas permissões existentes. Cada área continua exigindo seu acesso anterior: consulta geral exige fuel_supplies:view e fuel_supply_orders:view; histórico exige fuel_supplies:view; abertas exige fuel_supply_orders:view. Guardas de API não mudam.
- /ordens-abastecimento permanece como compatibilidade, redirecionando para /abastecimentos?view=open. indicator vira open_indicator; focus e demais parâmetros são preservados.
- A operação aberta é montada sob demanda e preservada oculta após visita; requisições e diálogos ficam suspensos fora de sua área. Busca e paginação permanecem, sem listagem duplicada visível.
- Emissão permanece exigindo fuel_supplies:view e fuel_supply_orders:create, como na entrada anterior; a consolidação não concede criação a um perfil somente ordens. Utilitários de postos/exportação continuam no menu móvel para acomodar as três áreas sem nova fileira.

## Rollback
Restaurar frontend-before e a fonte79b5723 usando a publicação de assets seguida de troca atômica do index. Preservar banco/configurações; nenhuma API, PostgreSQL ou Cloudflare precisa ser reiniciada. Sem restauração de banco.
