# ExecPlan — Rede credenciada por valor — 26/10/2026

## Objetivo
Configurar explicitamente o contrato Prime como rede credenciada por valor, sem preço por litro contratado. O usuário confirmou: pedidos não reservam dinheiro; somente o valor efetivo confirmado com comprovante desconta saldo.

## Estado inicial verificado
Produção limpa4b91f02. Candidato isolado, árvore equivalente523bf82; branch feature/network-value-fuel-20261026. Baseline frontend492 testes/77 arquivos, lint0 erros/39 avisos, build; backend700; PostgreSQL38. Saldo já corrigido do contrato preservado.

## Arquivos previstos
Model/schema/serialização do contrato e snapshot da política na ordem; migration aditiva; serviços financeiro e abastecimento; formulários de contrato, pedidos individuais/lotes, confirmação e prorrogação; testes reais e de interface.

## Alterações funcionais proibidas
Não presumir modalidade de outros contratos. Não criar preço fictício, reserva de valor zero ou débito na emissão. Não recalcular registros anteriores. Preservar pedidos emitidos com preço fixo, cancelamento/expiração, assinatura, comprovante, escopo e retificação por diferença. A conciliação da fatura não desconta novamente despesas já registradas.

## Passos de implementação
1. Campo explícito FIXED_PRICE/NETWORK_VALUE no contrato e fotografia da modalidade na ordem.
2. Rede sem exigência de preço, emissão sem reserva e consumo real idempotente sob lock do contrato; divergência financeira existente bloqueia novos pedidos após saldo negativo.
3. Interface explica desconto posterior, omite preço/reserva e permite combustíveis da operação.
4. Testar criação individual/lote, confirmação e retificação, concorrência, mudança de modalidade e preservação do saldo na emissão/cancelamento.
5. Backup, migration, publicação e configuração auditada somente do contrato identificado pelo usuário.

## Validação visual
Página produtiva e formulários sem enviar pedidos de teste. Preço fixo continua disponível nos demais contratos. Componentes e temas existentes preservados.

## Testes e build
Frontend497 testes/77 arquivos aprovados; backend700 aprovados; PostgreSQL49 aprovados em banco isolado5441, após migration desde banco vazio. Lint0 erros/39 avisos anteriores, build de produção e diff-check aprovados. Cobertura inclui ausência total de reserva na emissão/lote/cancelamento/expiração/reabertura; confirmação pelo valor real; concorrência da mesma ordem e de ordens distintas; retificação e conciliação sem débito duplicado; políticas antigas preservadas; cadastro protegido e auditado; vínculo de ordem legada sem reserva.

## Resultado
Implementação validada. Backup completo com checksum em storage/backups/20261026-network-value/database; publicação e configuração auditada serão verificadas na página pública e registradas nessa pasta. Modalidade por valor será aplicada somente ao contrato indicado pelo usuário. Saldo e histórico anteriores preservados.

## Pendências / decisões
HML tem desenvolvimento independente de itens/aditivos. A nova migration deve ser reconhecida pela rotina de cópia diária antes da próxima execução; não sobrescrever fontes em andamento.

## Rollback
Backup de banco/anexos e cópia dos fontes/frontend. Não desfazer despesas reais registradas; reverter aplicação preservando dados e política fotografada de pedidos. Migration não exclui histórico nem altera saldo.

## Correções da revisão de máscaras
Três regressões do PR78 reproduzidas com testes falhando e corrigidas: preservação do rascunho inválido ao recuperar foco; decimais emitidos sem ponto final pendente; edição dos grupos inteiros em valores com centavos. Todos os testes passaram após a correção. Um teste de abertura assíncrona de modal de exclusão passou a aguardar o campo, corrigindo flutuação observada no CI Linux sem mudar a ação de exclusão do produto.
