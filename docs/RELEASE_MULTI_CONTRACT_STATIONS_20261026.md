# Postos em vários contratos — 26/10/2026

Solicitação expressa: liberar em produção o vínculo do mesmo fornecedor/posto em mais de um contrato.

O índice global de posto ativo é removido pela migration 0060_station_multi_contract. Permanece a unicidade de posto por contrato e de oficina por contrato. Postos e prestadores inativos continuam bloqueados; permissões e validação de vínculo/preço/saldo do contrato selecionado continuam obrigatórias.

O catálogo retorna cada posto uma vez, incluindo sua lista de contratos. O cadastro permite postos de outros contratos, preservando a reativação de vínculos anteriores no mesmo contrato. Nos pedidos, um único contrato elegível é preenchido automaticamente; vários contratos exigem escolha explícita. Pedidos iniciados no contrato mantêm esse contrato fixo. Trocar contrato invalida a prévia anterior e recalcula preços/reservas.

Validação: frontend 477 testes aprovados/75 arquivos, lint sem erros (39 avisos anteriores), build de produção concluído. Backend hermético 698 aprovados/144 pulados. PostgreSQL descartável em 5441: 35 testes aprovados, incluindo vínculos simultâneos em dois contratos, duplicação no mesmo contrato, permissões, catálogo sem duplicação, reativação, preservação de pedidos e preços/saldos/reservas independentes. Cadeia de migrations desde banco vazio até 0060 verificada.

Backup de banco/anexos anterior à publicação em `storage/backups/20261026-station-multi-contract/database/`, com checksum. Evidências e cópia do frontend anterior ficam na mesma pasta de release. Nenhum fornecedor é vinculado automaticamente.

Reversão: restaurar os fontes/frontend anteriores e reiniciar somente a API 8000. A migration inversa recusa recriar a exclusividade se já houver postos em vários contratos; revisar esses vínculos explicitamente antes de qualquer downgrade. Nunca restaurar um dump sobre novas operações apenas para reverter a interface.

Integração HML: o desenvolvimento em andamento contém a revisão paralela 0060_contract_items. Deve incorporar esta migration e unir as duas cabeças antes da próxima cópia diária de produção, preservando dados e o trabalho de itens/aditivos.
