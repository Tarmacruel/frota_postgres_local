# ExecPlan — Máscaras BRL e correção de saldo — 26/10/2026

## Objetivo
Permitir informar o saldo disponível correto, com conferência antes/depois e lançamento auditável, e usar máscaras brasileiras nos campos monetários de contratos, faturas, abastecimentos, manutenções, multas e sinistros. Publicação em produção autorizada pelo contexto da solicitação de correção na página produtiva. Saldo disponível confirmado pelo usuário para 2-860-2022: R$ 6.835.452,50.

## Estado inicial verificado
- Produção main c82a2a8 limpa; cópia de trabalho isolada em fix/brl-input-balance-correction-20261026, mesma árvore base.
- Baseline anterior: frontend477 testes, lint0 erros/39 avisos, build; backend698 aprovados; PostgreSQL35 aprovados.
- Saldo exibido incorreto690.380.702,50; valores de cadastro e abertura preservados como histórico. Backend dispõe de ajustes por diferença, mas a interface requer calcular essa diferença manualmente.

## Arquivos previstos
Componente MoneyInput e utilitário decimal compartilhados; formulários monetários identificados por seus campos; ContractSetupDialog/Inspector e API; schema/serviço/rota de correção de saldo; testes unitários, interface e PostgreSQL.

## Alterações funcionais proibidas
Não alterar preços/saldos/contratos automaticamente devido à máscara. Preservar precisão de seis casas dos preços de combustível. Não converter litros, quilômetros, percentuais ou quantidades em moeda. Não reescrever extrato, reservas, consumo ou aditivos antigos. Não interferir nos itens/aditivos em desenvolvimento na HML.

## Passos de implementação
1. Criar máscara BRL com digitação natural, agrupamento, colagem, validação de precisão e envio decimal canônico.
2. Criar correção por saldo final disponível, com lock, comparação do saldo esperado, idempotência, justificativa e fotografia antes/depois no extrato.
3. Integrar o componente nos campos monetários, mantendo payloads existentes.
4. Testar componente, colagens, máscaras, correção concorrente e proteção de reservas.
5. Backup, publicação, correção única pelo valor confirmado e verificação pública.

## Validação visual
Desktop/mobile e claro/escuro no formulário de correção e campos de cadastro; paste BRL e preço com seis casas; ausência de overflow.

## Testes e build
Concluídos: frontend492 testes/77 arquivos; backend700 aprovados/147 pulados; PostgreSQL38 aprovados em banco descartável5441; lint0 erros/39 avisos anteriores; build de produção e diff-check aprovados. Testes cobrem digitação/colagem BRL, ponto decimal do teclado, cursor, limpeza, valores negativos permitidos, seis casas de preço, payload canônico, prévia, concorrência e repetição da correção.

## Resultado
Publicado em produção às13:34 de26/10/2026; correção única confirmada pela interface às13:36. Saldo disponível6835452.50 e diferença-683545250.00 conferidos diretamente no banco, reservas/consumo zero preservados. Backup completo com checksum, publicação e conferências em storage/backups/20261026-brl-balance-correction. Cadastro mostra R$6.717.878,88 e preço de teste R$8,123456 foi conferido sem salvar. Nenhum outro valor financeiro foi alterado pela máscara. Sem CSS novo; componentes herdam os temas existentes. Inspeção visual na viewport natural em tema claro; não foi alterada a preferência de tema/tamanho do usuário.

## Pendências / decisões
Correção é do saldo disponível. Valores contratuais e lançamentos anteriores permanecem no histórico; a diferença fica explícita no extrato. APIs recebem decimais canônicos, sem separadores de milhar.

## Rollback
Backup de banco/anexos e fontes/frontend antes da publicação. Reverter código sem apagar movimentos financeiros; eventual correção do valor deve ser novo lançamento auditável. Sem migration necessária.

## Conferência final do indicador percentual
Após a correção, a comparação com a abertura antiga gerava falso alerta de10%. Base corrigida para saldo contratual + consumo acumulado, que representa o orçamento atual após créditos/débitos/correções e permanece estável ao executar despesas. Reservas continuam reduzindo o disponível. Regressão real compara5de orçamento corrigido com5disponível (sem alerta) e0,40 após reserva4,60 (com alerta). PostgreSQL38 aprovados e backend700 aprovados após esse ajuste.
