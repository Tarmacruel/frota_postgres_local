# ExecPlan — KPIs compactos e contraste — homologação

## Objetivo
Atender aos nove comentários do usuário em23/10: reduzir os KPIs de Veículos, Empréstimos, Posses, Manutenções, Sinistros, Multas, Abastecimentos e Ordens abertas, retirar a linha de ação repetida e aumentar o contraste. Condutores mantém sua escala atual, com a mesma família de cores.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `75926ae`, working tree limpo.
- O componente compartilhado `IndicatorBar` tem mínimo110px no desktop/104px no celular e uma terceira linha “Ver registros”, “Ver composição” ou “Selecionado”. Condutores usa componente próprio de66px.
- Baseline anterior imediatamente validado: frontend409 testes/71arquivos; lint0erros/39avisos anteriores; build HML aprovado. Os comentários coincidem com o código e a página autenticada em Ordens abertas.
- AGENTS, documentos da evolução visual, IMPLEMENT e PLANS consultados; screenshot do usuário e contact sheet alvo como referência.

## Direção visual e de interação
- Tese visual: indicadores baixos, leitura direta de rótulo e valor, superfícies semânticas mais presentes com texto escuro no claro e claro no escuro.
- Conteúdo: conservar rótulos, unidades, números, escopo global e resultado/limpeza de filtros; eliminar a linha auxiliar dentro de cada cartão. Não acrescentar ícones decorativos.
- Interação: realce breve de borda no hover e preenchimento na seleção, check discreto para seleção, foco de teclado independente da cor; respeitar movimento reduzido. Preservar alvos de toque e rolagem horizontal mobile.

## Arquivos previstos
`IndicatorBar.jsx/.css`, estilos de Condutores e associação das cores em `DriversPage.jsx`, tokens/estados de cor compartilhados em CSS e import global, pictograma check local em AppIcon; este plano e STATUS.

## Alterações funcionais proibidas
Sem backend, schema, dados, endpoints, payloads, cálculos, filtros, permissões, exportações ou produção. Não modificar o shell recém-entregue nem refatorar páginas inteiras.

## Passos de implementação
- [x] Compactar o componente e retirar a linha de ação repetida; manter seleção acessível.
- [x] Paleta central de tons semânticos, claro/escuro, incluindo Condutores.
- [x] Testes existentes, suíte frontend, lint, build e diff-check.
- [x] Backup e publicação exclusiva frontend HML; validar assets, dados, configurações e API preservados.
- [x] Conferir nove telas, filtros/limpeza, valores monetários, foco, desktop/mobile e temas; capturas, status e commit.

## Validação visual
Desktop1366×768 e viewport original2268×1045; mobile390/360. Todas as telas anotadas; duas áreas de manutenção e de abastecimento; rótulos longos e moeda; Condutores em CNHs vencidas. Verificar altura menor, contraste, seleção além da cor, teclado, totais sem alteração ao filtrar e acesso às demais ações. Não gravar dados de negócio.

## Testes e build
Reutilizar testes existentes de IndicatorBar/Condutores e páginas para consulta/URL/teclado. Gates obrigatórios: `npm run test`, `npm run lint`, `npm run build`. A apresentação será validada no navegador, sem testes que apenas reproduzam CSS.

## Resultado
Publicado exclusivamente na homologação em 23/10/2026.

- Componente reduzido de 110px para mínimo 66px no desktop e de 104px para mínimo 68px no celular. Altura observada de 66px no desktop amplo e 82px quando rótulos longos ocupam duas linhas em telas menores. Rótulos, unidades e números completos preservados; removida a terceira linha de ação, com check e aria-pressed indicando a seleção. Condutores mantém seu layout e dimensões.
- Paleta central: total neutro, informação azul, sucesso verde, pendência âmbar e alerta vermelho. Superfícies coloridas, texto de contraste alto e borda lateral; seleção com contorno e check, foco visível e transições com movimento reduzido. Contraste numérico dos 15 pares por tema (normal/hover/seleção): mínimo 4,95:1 no claro e 6,29:1 no escuro.
- Suíte completa: **409 testes aprovados em 71 arquivos**, duração 127,49s. Após os pequenos ajustes visuais encontrados no QA, **13 testes direcionados aprovados** em IndicatorBar/Condutores. Lint final: **0 erros/39 avisos anteriores**. Build HML e diff-check aprovados; aviso anterior de bundle acima de 650kB permanece.
- Backup de fonte `75926ae`, índice e configurações em `storage/backups/20261023-compact-kpis`. Publicação pelo script exclusivo de frontend HML; **68 tabelas idênticas**, configurações/backend/PID preservados, nove assets públicos conferidos por SHA256 e duas APIs saudáveis. Sem migration, restauração, reinício ou alteração de produção.
- QA autenticado nas nove telas anotadas, incluindo as duas áreas de Manutenções e Abastecimentos. Desktop 2268×1045 e 1366×768; mobile 390/360; claro/escuro; contagens, moeda e litros sem texto “Ver registros” ou “Ver composição”. Clicar/limpar Ativos preservou os totais (313/271); CNHs vencidas mostrou 6 de 327; filtro de manutenção sem registros e filtro de valor por teclado funcionaram. Foco visível por Tab, check efetivo, alvos de toque e rolagem lateral preservados, sem overflow horizontal da página ou erros de console.
- Moeda de R$ 80.294,66 comprovada em uma linha no celular após o ajuste final. Limite: QA por dimensões do navegador, sem aparelho físico. Tema claro, viewport original e URL `/ordens-abastecimento` sem filtros restaurados; nenhum dado de negócio foi gravado.
- Evidências privadas: `browser-qa-verification.json`, `color-contrast.json`, `publication-verification.json` e capturas das telas, incluindo `kpis-proof.png`, `vehicles-mobile-dark.png`, `drivers-mobile-light.png` e `maintenance-1366-dark.png`.

QA inicial identificou que AppIcon já era chamado como `check` no componente anterior, mas não possuía esse desenho. Acrescentado o caso local para tornar a marcação visual efetiva, sem dependência ou alteração de comportamento. Testes de UI e build revalidados após esse ajuste.

Conferência em 360px identificou quebra do valor monetário de 80.294,66 nos cartões agora mais estreitos. Ajuste de apresentação por unidade: moeda usa 18px no celular, mantendo contagens de 23px e sem abreviar valores. Linha única do valor validada no navegador após o build final.

## Pendências / decisões
Ajuste compartilhado aplica-se também aos demais consumidores de IndicatorBar, garantindo consistência. Dashboard e indicadores financeiros específicos ficam fora desta fase; cálculos e comportamento intactos.

Nenhuma pendência de ativação. Aguardar avaliação do usuário em homologação antes de qualquer publicação futura em produção.

## Rollback
Preservar índice frontend e fonte `75926ae` em `storage/backups/20261023-compact-kpis`. Reverter apenas arquivos desta fase e republicar pelo script HML; sem reinício da API ou restauração de banco.
