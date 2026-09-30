# Fase 03 — integração operacional e consultas compartilhadas

Implementada na cópia `D:\FROTAS\frota_emprestimos_testes`, branch `feature/emprestimos-secretarias`.

## Comportamento entregue

- A listagem de veículos inclui a secretaria de origem e a operadora atual. Consultas usam `EXISTS`, sem multiplicar linhas ou totais por empréstimos/lotação.
- A resposta de veículos informa origem, operadora, empréstimo ativo, situação emprestado/recebido e capacidades por secretaria. As permissões de módulo continuam obrigatórias.
- A página de veículos identifica a origem e o empréstimo; a origem pode editar o cadastro. A recebedora opera o veículo. Os seletores de novas operações excluem veículos disponíveis apenas para consulta.
- Posses, abastecimentos, ordens, manutenções, multas e sinistros registram a secretaria responsável e o vínculo com o empréstimo. Abastecimentos/ordens reutilizam `organization_id`.
- A atribuição é calculada no servidor pela data efetiva da operação, sob bloqueio do veículo que coordena entrega/devolução. A edição sem mudança de data preserva a atribuição já gravada. Retificações de data são reavaliadas.
- A origem consulta todo o histórico. Durante o empréstimo, a recebedora consulta o histórico anterior e atual. Depois da devolução, conserva acesso somente até a devolução; o veículo sai da sua lista operacional.
- O mesmo limite se aplica a consultas paginadas, busca, detalhe, fotos, comprovantes, anexos, termos e rotas. A secretaria responsável pode corrigir seus próprios registros históricos após a devolução; acesso compartilhado não concede edição.
- Posses não podem atravessar uma entrega/devolução entre secretarias. Rotas, encerramento e correção de posse seguem a responsabilidade da posse.
- Importações respeitam a origem e não podem contornar um empréstimo mudando a lotação. Novos veículos importados recebem origem quando identificável.
- Criar o fluxo de assinatura de um documento operacional exige responsabilidade sobre o registro. Os documentos e arquivos existentes são preservados; integrações externas continuam desabilitadas no ambiente.

## Relatórios e legado

O histórico compartilhado é uma permissão de leitura. Totais por secretaria são atribuídos à responsável pela operação: relatório de posses/rotas, consumo de combustível, seleção de despesas de manutenção para pagamento e análises de custos/indicadores. A visão global mantém cada registro uma única vez. Indicadores por secretaria são calculados separadamente e não substituem os snapshots globais.

Não houve reatribuição em massa nem nova migration: a fase utiliza os campos das migrations 0044/0045. Registros legados com vínculo nulo usam, nos relatórios, somente uma lotação histórica identificável na data da operação; ausências/ambiguidades não são presumidas pela lotação atual. Permanecem para revisão administrativa. Uma multa sem horário em um dia com troca de responsabilidade também não recebe atribuição presumida.

## Verificação

- Suíte backend completa: 414 testes aprovados, 19 skips condicionais de outras integrações; seis avisos preexistentes de depreciação.
- Nove novos cenários de integração PostgreSQL: lista compartilhada/cadastro da origem, ciclo com corte histórico, custos e legado, cinco módulos operacionais e posse atravessando entrega/histórico sem referência. Incluem leitura por terceiros negada, edição pela origem negada, correção pela antiga recebedora, paginação sem duplicação e criação de documento operacional.
- Os 17 testes da API de empréstimos e os testes de migration/fundação continuam passando. Mutações de integração usam exclusivamente bancos descartáveis na porta 5441.
- Frontend: suíte completa com 128 testes aprovados; depois da inclusão do caso de seletor somente leitura, oito testes dos formulários afetados aprovados. Total de casos existentes: 129. Compilação Vite aprovada.
- Após a revisão final de preservação da atribuição, os 26 cenários de API e integração operacional foram executados novamente e passaram.
- Verificação em 29/09/2026: login e onze consultas autenticadas/de saúde retornaram HTTP 200 tanto em localhost quanto pelo túnel. A lista de veículos foi conferida no navegador com a origem visível. Evidência técnica local: `storage/loan-tests/phase3-smoke.json`; script reproduzível: `scripts/verify_loan_phase3.py`.
- A cópia mantém 284 veículos e nenhum empréstimo fictício na base de trabalho. PostgreSQL permanece na migration 0045. Produção responde HTTP 200 e seu repositório continua sem alterações.

O navegador registra o bloqueio do beacon de métricas injetado pelo Cloudflare pela política CSP existente. Isso não impede login ou uso dos módulos; não foi necessário enfraquecer a política para liberar o túnel.

## Ambiente e limites

Endereços: `http://localhost:6969` e `https://testefrota.sirel.com.br`.

Comandos, a partir da cópia:

```powershell
.\scripts\loan-tests.ps1 status
.\scripts\loan-tests.ps1 start
.\scripts\loan-tests.ps1 stop
```

As credenciais permanecem as da cópia restaurada; a conta administrativa específica de teste está no arquivo local ignorado `storage/loan-tests/test-login.json`. Não compartilhar esse arquivo nem versioná-lo.

A interface para solicitar/aceitar/devolver empréstimos é a **fase 04**. Nesta entrega, o ciclo continua disponível pela API documentada em `FASE_02_API.md`; a interface existente já reflete os efeitos dos empréstimos. Termos de empréstimo/devolução entre secretarias são a fase 05; regularização retroativa, fase 06. Esta entrega não publica mudanças em produção.
