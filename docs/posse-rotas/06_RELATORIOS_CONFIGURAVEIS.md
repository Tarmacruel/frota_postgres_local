# Fase 6 — Relatórios Configuráveis em PDF e XLSX

## 1. Objetivo

Implementar relatórios de posse e rota com filtros, presets e seleção de colunas, garantindo que PDF e XLSX utilizem exatamente a mesma definição autorizada no backend.

## 2. Princípios

- minimização de dados por padrão;
- backend valida filtros e colunas;
- frontend não possui lista independente de colunas oficiais;
- PDF e XLSX compartilham registry e dataset;
- exportação é auditada;
- dados não autorizados não são enviados ao navegador;
- grandes volumes usam paginação/streaming ou limites seguros.

## 3. Registry única de colunas

Criar registry tipada no backend. Cada coluna deve declarar:

- `key` estável;
- título;
- categoria: posse, rota, destino, devolução ou auditoria;
- tipo/formatação;
- função de extração;
- perfis autorizados;
- se integra cada preset;
- se contém dado pessoal;
- regra de mascaramento;
- largura/orientação sugerida;
- compatibilidade com agregação por posse ou expansão por rota.

Criar endpoint autenticado, por exemplo:

`GET /api/possession/reports/metadata`

O endpoint retorna apenas colunas e presets autorizados para o usuário atual.

O backend deve rejeitar chaves inexistentes ou não autorizadas mesmo que sejam enviadas manualmente.

## 4. Granularidade do relatório

Definir explicitamente dois modos:

### 4.1 Por posse

Uma linha por posse. Dados de rotas podem ser agregados:

- quantidade de rotas;
- quantidade de destinos;
- destinos resumidos;
- quilômetros totais;
- primeira saída e último retorno.

### 4.2 Por rota

Uma linha por rota, repetindo somente identificadores mínimos da posse. Destinos podem ser apresentados de forma ordenada em célula ou, se necessário, em planilha secundária.

O usuário deve selecionar o modo antes de escolher colunas incompatíveis. A registry deve indicar compatibilidade.

## 5. Presets

### Resumido — padrão

- número da posse;
- placa;
- condutor;
- início;
- fim;
- status;
- quantidade de rotas;
- quilômetros totais.

Não incluir documento, contato, coordenadas ou auditoria.

### Operacional

- campos do resumido;
- identificação do veículo;
- rota/finalidade;
- destinos;
- saída/retorno;
- hodômetros;
- observações operacionais.

### Completo

- todas as colunas administrativas autorizadas ao perfil;
- ainda excluir IP, User-Agent, request ID e coordenadas por padrão;
- metadados técnicos exigem seleção manual por `ADMIN`.

### Personalizado

- seleção manual entre colunas retornadas pelo backend.

## 6. Filtros

Implementar no backend:

- período inicial/final;
- critério temporal claramente definido: início da posse, saída da rota ou outro selecionável;
- veículo;
- condutor;
- status da posse;
- status da rota;
- com/sem retorno;
- com/sem confirmação de devolução;
- busca textual limitada e parametrizada.

Validar intervalos máximos configuráveis para evitar relatórios excessivos. Informar ao usuário quando o filtro precisar ser reduzido.

## 7. Endpoints

Sugestão:

- `GET /api/possession/reports/metadata`
- `POST /api/possession/reports/preview-pdf`
- `POST /api/possession/reports/export-xlsx`
- `GET/PUT /api/users/me/report-preferences/possession`, se utilizada persistência backend.

Payload:

- modo/granularidade;
- preset;
- lista de `column_keys`;
- filtros;
- orientação e opções estritamente enumeradas.

Não aceitar expressão SQL, nome de atributo arbitrário, template HTML ou função enviada pelo cliente.

## 8. Preferências

Preferir persistência backend associada ao usuário:

- preset;
- modo;
- chaves de coluna;
- sem valores de filtros que contenham dados pessoais;
- sem conteúdo exportado;
- validação novamente ao carregar, pois permissões podem mudar.

Se for criada tabela, usar migration própria e chave única por usuário/tipo de relatório.

Caso se utilize localStorage por decisão justificada:

- chave com namespace e ID não sensível do usuário;
- armazenar apenas preset, modo e chaves;
- não armazenar nomes, documentos, contatos, filtros ou registros;
- limpar preferências inválidas.

## 9. Frontend

Adicionar botão **Mais opções** junto a preview PDF e exportação XLSX.

O painel deve permitir:

- escolher modo por posse/rota;
- escolher preset;
- selecionar/desmarcar colunas;
- selecionar todas as colunas autorizadas com cautela;
- reorganizar colunas por teclado e botões;
- configurar filtros;
- restaurar padrão;
- salvar preferência;
- previsualizar PDF;
- exportar XLSX.

Exibir aviso quando uma coluna contiver dado pessoal ou restrito.

## 10. Geração PDF

- backend usa registry para cabeçalhos e valores;
- orientação retrato/paisagem definida por regra ou opção enumerada;
- evitar fonte ilegível por excesso de colunas;
- sugerir reduzir colunas quando necessário;
- repetir cabeçalho em páginas;
- incluir filtros, data/hora, usuário e número de registros;
- não incluir senha, token, IP ou dados técnicos sem seleção autorizada;
- `Content-Disposition` e `Cache-Control` corretos.

## 11. Geração XLSX

- usar mesma ordem e mesma registry do PDF;
- tipos reais para números e datas;
- cabeçalhos congelados;
- autofiltro quando suportado;
- largura limitada;
- prevenir formula injection: valores iniciados por `=`, `+`, `-` ou `@` vindos de texto devem ser neutralizados;
- planilha de metadados/filtros sem dados excessivos;
- nenhuma macro.

## 12. Auditoria

Eventos:

- `REPORT_PREVIEW`;
- `REPORT_EXPORT_XLSX`;
- `REPORT_PREFERENCE_UPDATE`.

Registrar:

- usuário;
- modo;
- nomes das colunas;
- filtros normalizados;
- quantidade de registros;
- duração;
- sucesso/falha;
- request ID.

Não registrar conteúdo integral das linhas.

## 13. Testes obrigatórios

- metadados variam por perfil;
- coluna restrita enviada manualmente é rejeitada;
- presets contêm somente colunas esperadas;
- PDF e XLSX recebem mesma ordem/chaves;
- filtros produzem mesmo conjunto de registros;
- modo por posse e por rota;
- registros legados;
- preferência inválida é saneada;
- intervalo excessivo é rejeitado;
- formula injection é neutralizada;
- arquivos exigem autenticação e não são cacheados;
- auditoria contém metadados sem conteúdo integral;
- frontend não mantém lista paralela divergente;
- navegação por teclado no seletor de colunas.

## 14. Critérios de aceitação

- botão “Mais opções” disponível;
- presets e modo personalizado funcionam;
- PDF/XLSX refletem a mesma seleção e filtros;
- backend impede coluna não autorizada;
- preset padrão minimiza dados;
- preferências não armazenam dados pessoais;
- exportações são seguras e auditadas.

## 15. Prompt para o Codex

```text
Implemente exclusivamente a Fase 6 descrita em:

docs/posse-rotas/06_RELATORIOS_CONFIGURAVEIS.md

Branch obrigatória: feat/posse-rotas-relatorios-devolucao

Leia a matriz RBAC/LGPD e o backend/termo das fases anteriores. Substitua a atual
definição fixa de colunas do módulo de posses por uma registry única no backend,
sem manter listas oficiais divergentes no frontend.

Implemente:
- registry tipada de colunas e perfis;
- endpoint de metadados autorizado;
- modos por posse e por rota;
- presets Resumido, Operacional, Completo e Personalizado;
- filtros server-side;
- botão “Mais opções”;
- seleção e ordenação acessível de colunas;
- PDF e XLSX oficiais gerados pelo backend com mesma registry/dataset;
- preferência do usuário sem dados pessoais;
- auditoria de preview/exportação.

Requisitos críticos:
- preset padrão sem documento, contato, coordenadas ou metadados técnicos;
- backend rejeita coluna restrita enviada manualmente;
- não aceitar SQL, atributo arbitrário ou template do cliente;
- proteger contra formula injection em XLSX;
- não carregar toda a base no frontend para filtrar;
- não registrar conteúdo integral do relatório;
- arquivos autenticados e no-store;
- mesmos filtros, ordem e formatação lógica nos dois formatos.

Crie migration de preferência apenas se necessária e valide o head real. Crie testes
de RBAC, consistência entre formatos, filtros, legado, formula injection, auditoria e
acessibilidade do seletor.

Execute testes, build e verificações de performance/N+1. Atualize CHECKLIST_EXECUCAO
somente com evidências.

Entregue:
- catálogo de colunas e classificação;
- contratos dos endpoints;
- migration, se houver;
- arquivos alterados;
- testes e resultados;
- limites de volume;
- riscos para a Fase 7.

Não avance para a Fase 7.
```