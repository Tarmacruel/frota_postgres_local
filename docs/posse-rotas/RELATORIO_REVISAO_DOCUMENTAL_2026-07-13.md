# Revisão institucional, documental e operacional — 13/07/2026

## Escopo e referência

- Branch revisada: `main`.
- SHA inicial local e remoto: `1619fbf0ed9f7553ba2ec6b959c8a7b321638bd5`.
- Banco de produção: PostgreSQL 16, consultado sem alteração de schema.
- Alembic em produção: `heads = current = 0040_report_preferences`.
- Não foi criada nem aplicada migration nesta revisão.

## Resultado da revisão

O Termo de Posse e Responsabilidade passou a ser um documento institucional final, gerado exclusivamente pelo backend a partir do estado persistido e consistente da posse. O documento não exibe UUID, request ID, endereço IP, User-Agent, nomes de componentes, observações de desenvolvimento ou explicações sobre a implementação do sistema.

A apresentação adotada é municipal e sóbria: brasão oficial, nome do Município, Secretaria Municipal de Administração, Setor de Frotas, CNPJ, endereço, numeração do termo, situação, data de emissão no fuso institucional, hierarquia tipográfica, paginação e indicação de continuação.

## Termo único e assinaturas

- Modelo documental do termo: `2.0`.
- Declaração eletrônica de ciência: versão `1.0`.
- O documento contém identificação da posse, entrega, deveres de responsabilidade, rotas, destinos, devolução, declaração final e assinaturas.
- O registro eletrônico identifica o agente responsável, perfil/unidade, CPF mascarado, data/hora, código de registro e hash do conteúdo.
- O texto não atribui ao condutor uma assinatura digital inexistente e não usa as expressões assinatura qualificada ou ICP-Brasil.
- A ciência física voltou ao termo com campos para a pessoa responsável pela condução e para o responsável pela entrega.
- Uma rota nova não gera outro termo. O registro de entrega e aceitação permanece estável; rotas e devolução integram a via oficial atualizada.
- Termos públicos antigos e sua nomenclatura permanecem somente para registros legados.

## Consistência e concorrência

O fluxo oficial usa ordem de bloqueio estável por veículo, posse, documento e solicitação de assinatura. Depois do lock, o grafo ORM é recarregado com `populate_existing`, evitando que um snapshot previamente carregado seja usado para gerar ou assinar uma via desatualizada. O PDF protegido é montado dentro da mesma transação de leitura consistente e a auditoria é confirmada junto com a operação.

O teste PostgreSQL dedicado comprovou que uma atualização concorrente fica bloqueada enquanto o documento oficial mantém o lock e que o mesmo objeto ORM é atualizado após a recarga.

## Autorização e LGPD

- `ADMIN` e `PRODUCAO` podem visualizar a via integral e operar o registro interno de assinatura conforme as permissões do módulo.
- `PADRAO` recebe resposta e PDF minimizados: identidade, documento, contato, observações, localizações, evidências, identificadores e hashes técnicos são ocultados ou mascarados.
- `POSTO` permanece sem acesso ao módulo de posses por padrão.
- Overrides individuais podem restringir, mas não ampliar, o teto do perfil.
- Pesquisa e relatórios de `PADRAO` não consultam condutor, documento ou contato como atalho de busca.
- Preview e download são autenticados, auditados, enviados com `no-store` e `nosniff`.
- O novo termo não possui endpoint público de verificação.

## Demais documentos e relatórios

- Relatórios configuráveis de posses: PDF/XLSX usam a mesma registry, o mesmo dataset e a identidade municipal.
- Exportação analítica: o antigo conteúdo textual rotulado como PDF/XLSX foi substituído por PDF ReportLab e workbook OOXML reais, com brasão, rodapé, metadados e proteção contra formula injection.
- Planilhas de processos de pagamento: cabeçalho de importação preservado, propriedades institucionais, aba de informações, tipos numéricos/datas e neutralização de fórmulas.
- Relatórios e comprovantes gerados no frontend receberam a mesma fonte institucional de nome, CNPJ, endereço e setor responsável.
- O brasão utilizado é o arquivo rastreado `brasao-pmtf.png`; a geração backend falha de forma explícita se o ativo institucional não estiver no pacote.

## Dependências documentais

- `reportlab==5.0.0`.
- `font-roboto==0.0.1`, Apache-2.0, com fonte regular e bold incorporadas ao PDF para renderização consistente no Windows.
- `tzdata==2026.1`, com apresentação em `America/Bahia`.
- SHA-256 do sdist verificado de `font-roboto==0.0.1`: `8bc9136bf46609fbb13af4783016799b14e23dda294a61791171de7ea2ec457f`.

As decisões de identidade e assinatura estão formalizadas em `ADR_003_IDENTIDADE_E_ASSINATURA_DO_TERMO_UNICO.md`.

## Evidências executadas

| Validação | Resultado real |
|---|---|
| `python -m pytest tests -q` | 194 aprovados, 19 pulados, 3 warnings de depreciação |
| Testes PostgreSQL de schema, API e consistência | 29 aprovados, banco descartável removido |
| Testes focados de termo/devolução | 35 aprovados |
| `npm test -- --run` | 13 arquivos, 28 testes aprovados |
| `npm run build` | Vite 8.1.4, 974 módulos, build aprovado |
| `npm run lint` | 0 erros, 45 warnings preexistentes |
| `npm audit --audit-level=low` | 0 vulnerabilidades |
| `pip check` | sem dependências quebradas após a atualização de hardening |
| `pip-audit` | reduzido de 10 achados em 6 pacotes para 1 residual sem correção em `ecdsa` |
| `python -m compileall -q app tests` | aprovado |
| `git diff --check` | aprovado; apenas avisos de normalização LF/CRLF |
| `alembic heads/current/history --verbose` | head e current em `0040_report_preferences` |
| Upgrade completo em PostgreSQL limpo | `0001` até `0040`, concluído |
| Revisão visual do termo assinado | 2 páginas; brasão, continuação, declaração e assinaturas conferidos; sem títulos órfãos |

## Residuais conhecidos

- Os 45 warnings de lint do frontend são preexistentes e não bloqueiam o build; não foram misturados a esta correção documental.
- `ecdsa`, dependência transitiva de `python-jose`, possui advisory sem versão corrigida. A aplicação permanece configurada exclusivamente com HS256, sem caminho de execução ECDSA. As dependências com correção disponível foram fixadas em versões não vulneráveis.
- Versões corrigidas verificadas no ambiente: `click 8.3.3`, `cryptography 48.0.1`, `idna 3.15`, `Mako 1.3.12` e `pip 26.1.2`.
- Endpoints públicos de termos antigos continuam limitados ao legado conforme o ADR substitutivo; o termo único novo permanece autenticado.

## Publicação

Esta seção deve receber o SHA final, o horário do reinício e os resultados dos smoke tests pós-publicação. Nenhuma afirmação de deploy é feita antes dessa evidência.
