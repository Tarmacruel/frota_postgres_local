# ExecPlan — Aditivos por item e controle quantitativo — homologação

## Objetivo
Executar integralmente o plano aprovado em26/10/2026: itens permanentes, abertura quantitativa obrigatória para novos pedidos, abastecimento/ARLA/manutenção com quantidades, aditivos tipados atômicos com prévia, limite acumulado25% e demonstrativo PDF/XLSX. Efeito financeiro de reajuste conferido no instrumento. PDFs enviados somente como referências de teste.

## Estado inicial verificado
- Repositório HML D:/FROTAS/frota_emprestimos_testes, branch feature/contract-items-amendments-hml-20261026, basef85004d, limpo antes deste plano.
- Baseline anterior:476 frontend,698 backend,34 PostgreSQL real; lint0 erros/39 avisos, builds aprovados. Produção em263ebee/schema0059; não será alterada.
- HML API6969, PostgreSQL5441, schema0059. Rotina06h usa staging e descarta configurações exclusivas de testes.
- AGENTS e regras visuais lidos. Backend/schema autorizados expressamente pelo plano funcional; fases são sequenciais e a ordem de implementação integral já foi autorizada.

## Arquivos previstos
Modelos/schemas/migration aditivos; serviços de itens/aditivos/quantidades; integração dos serviços de saldo, abastecimento e manutenção; APIs; editor único, cadastro/abertura, linhas operacionais e relatórios; testes e status.

## Alterações funcionais proibidas
Não publicar/reiniciar/escrever em produção, importar dados dos PDFs, presumir saldo ou quantitativos históricos, apagar movimentos ou criar consumo real para QA. Não enfraquecer permissões/escopo, mudar rotas existentes ou descontar faturas novamente.

## Passos de implementação
1. [x] Base de itens, preços, abertura, extrato quantitativo e migrations aditivas; regressões reais.
2. [x] Integração operacional: reservas, execução/substituição, cancelamento/expiração, retificações e lotes, preservando idempotência.
3. [x] Aditivos atômicos, prévia, snapshots, limite acumulado e anexos; UI integrada e demonstrativo.
4. [x] Testes completos/lint/build, migração ensaiada e rotina06h/falha, backup/reversão e publicação exclusivamente HML.
5. [x] QA desktop/mobile claro/escuro, registro de evidências e conclusão.

## Validação visual
Editor amplo, quatro seções na mesma tela; telas pequenas inteiras, abas sem compressão e foco/Escape. Configuração pendente explícita. Usar tokens existentes, divisórias e tabelas compactas. Tese visual: formulário operacional sóbrio com uma ação principal. Conteúdo: identificação, alterações/itens, impactos e confirmar. Interação: revelação de seções selecionadas e estados de revisão/confirmar, com movimento reduzido respeitado.

## Testes e build
Backend padrão preservado com nova flag quantitativa desligada; suíte específica em PostgreSQL descartável5441 com flags ligadas. Documentos:2TA altera DieselS10 6,02→6,21 eS500 5,74→5,96;4TA acrescenta32.500L gasolina×6,54,20.625L S500×6,32,21.875L S10×6,53 =485.743,75. ARLA isolado, efeito combinado,25% exato/excedido, base ITEM/GROUP/GLOBAL, concorrência, repetição, lotes, legado, fatura sem dupla baixa. Frontend completo, lint, build, inspeção dos dois temas.

## Resultado
Publicação HML concluída. Testes:706 backend,486 frontend (78 arquivos),52 PostgreSQL real descartável e nove frontend direcionados finais; lint0 erros/39 avisos preexistentes, build HML aprovado. Os testes PostgreSQL cobrem reserva/execução/retificação, ARLA, substituição, divergência, concorrência quantitativa, repetição, lote atômico, expiração/reabertura preservando as duas linhas e correção vinculada sem retirar quantidade consumida. Os exemplos documentais foram reproduzidos em banco descartável:2TA altera somente S10/S500;4TA acrescenta R$485.743,75 com identidade permanente apesar da numeração diferente. Não houve importação em contrato real.

Ensaio de migration: clone privado da HML com67 tabelas originais, atualização da revisão de produção0060_station_multi_contract até0061_items_station_merge, preservação integral das colunas existentes e7 tabelas novas vazias. Falha injetada antes da ativação preservou banco,API e estados oficiais da rotina06h. A migração de compatibilidade0061_network_value_fuel→0062_items_network_merge também preservou a modalidade e todas as colunas originais. Evidências privadas em storage/backups/20261026-contract-items (rehearsal.json,refresh-failure.json,network-schema-rehearsal.json,logs).

Ativação de26/10: schema0062_items_network_merge e flag quantitativa ativa; APIs reiniciadas somente na porta6969. As67 tabelas originais foram preservadas na primeira ativação e as74 tabelas na extensão de compatibilidade. Nenhuma configuração real foi confirmada automaticamente; apenas dois contratos e um veículo explicitamente fictícios para QA. Instrumento combinado e anexo, abertura em tela, emissão e cancelamento combustível/ARLA, manutenção450→270, PDF/XLSX e hash do anexo validados. Desktop/mobile e claro/escuro, foco/Escape, sem overflow horizontal. Tema/viewport/URL original restaurados. [Guia operacional, limites e reversão](CONTRACT_ITEMS_HOMOLOGATION_20261026.md).

## Pendências / decisões
- Quantidades abrangem combustível, ARLA, serviços e peças de manutenção, obrigatórias nos contratos de ambos os módulos para novos pedidos.
- Abertura remanescente inclui reservas abertas; elas serão vinculadas sem novo débito financeiro.
- Histórico de acréscimos e base de adjudicação precisam de conferência explícita. Reajuste não usa a margem25%.
- Nova configuração CONTRACT_QUANTITY_ENABLED inicialmentefalse no código; ativar somente na HML durante publicação coordenada. Não copiar configurações de produção.
- Preços e fatos anteriores preservados. Divergências de execução são registradas, não descartadas; novos pedidos ficam bloqueados.
- Integração26/10: outra entrega autorizada em chat separado publicou postos em vários contratos. Incorporados comportamento e migration paralela0060_station_multi_contract, unidos pela revisão0061_items_station_merge. Esta entrega não publica nada em produção.
- Efeitos posteriores ao dia corrente exigem confirmação a partir da data informada; não há ativação financeira automática agendada. Instrumentos anteriores são documentados sem reescrever pedidos e preços já utilizados.
- Correções são instrumentos vinculados, com lançamentos de diferenças; sem edição destrutiva do demonstrativo confirmado. Quantidades negativas são restritas às reversões de acréscimos do instrumento corrigido e ao saldo ainda não consumido.
- Corrigido durante desenvolvimento: build padrão atingiu dist da HML; foi restaurado imediatamente o build HML anterior conferido. O candidato final será gerado em diretório privado com --mode homologation e publicado apenas após a migration.
- Concluído: editor e relatórios usam superfície opaca; tela inteira no celular supera o estilo genérico de sheet, fontes16px e controles de toque. PDF tem download direto e evita glifos de seta não suportados pela fonte do exportador.
- Atualização paralela: modalidade NETWORK_VALUE foi confirmada pelo usuário em outra conversa. Somente schema/merge preparados aqui para a rotina06h; enquanto a entrega operacional correspondente não for integrada na HML, proteção explícita impede aplicar reservas de preço fixo a essa modalidade. A versão inicial do schema copiada tem SHA256 DFD46D835663946E088EAF6F85BAA1B168E1BF057DA5969368FB4317068CF7C2. Não houve mudança automática da modalidade nos contratos reais.
- A fixture PostgreSQL financeira agora desliga explicitamente a flag quantitativa antes das fixtures específicas ligarem-na, evitando dependência da configuração da HML que foi ativada durante a execução. Após o ajuste,52 testes reais aprovados.

## Rollback
Backup privado em storage/backups/20261026-contract-items. Preservar banco/anexos/configurações/código/build antes da ativação. Desligar a flag quantitativa e restaurar código/build se necessário; manter schema aditivo e gravações. Sem downgrade ou restauração automática de banco. Rotina06h não pode trocar staging se migrations/validações falharem.
