# ExecPlan — Fase única — revisão de Parâmetros em homologação

## Objetivo
Revisar Identidade, Aparência, Formulários e Registros, corrigindo defeitos reproduzidos de prévia, acessibilidade, rascunhos e recuperação de erros. Publicar somente o frontend de homologação.

## Estado inicial verificado
- Branch: `fix/parameters-review-hml-20261029`, derivada de `feature/superuser-settings-hml-20261029`.
- HEAD inicial: `71e6c55`; working tree inicialmente limpo.
- HML API 6969 e schema 0063 ativos; produção 8000 permanece intocada.
- Frontend anterior copiado para `storage/backups/20261029-parameters-review/frontend-before`.
- Baseline anterior: frontend 663 testes; lint sem erros/39 avisos existentes; build aprovado. Nova execução de baseline nesta fase registrada nos logs privados.
- Inspeção inicial: a prévia ignora densidade; nomes de ícones incluem `orders`; erro de carregamento não oferece repetição; conflito não oferece recuperação; chaves de campos adicionais podem ser reutilizadas depois da remoção.

## Arquivos previstos
- `frontend/src/pages/SystemSettingsPage*`, `utils/systemBranding*` e utilitário de comparação/mesclagem de rascunhos.
- `frontend/src/styles/system-settings.css`, `components/RecordAdministration*` quando necessário para resolver falhas de concorrência e recuperação.
- ExecPlan e STATUS da iniciativa.

## Alterações funcionais proibidas
- Nenhuma mudança em regras financeiras, permissões, API, schema ou banco ativo.
- Nenhuma publicação ou reinício em produção; nenhuma nova restauração diária.
- Não alterar configurações publicadas ou registros reais para realizar testes destrutivos. Usar servidor/banco descartáveis com dados fictícios.

## Passos de implementação
- [x] Inventariar fonte, publicação e tela autenticada sem alterar dados.
- [x] Registrar baseline, preservar fingerprints e preparar QA isolada.
- [x] Reproduzir e corrigir defeitos de prévia, contraste, validação, conflitos e identificação dos campos.
- [x] Conferir administração de registros, recuperação e dados preservados.
- [x] Validar quatro áreas desktop/mobile, claro/escuro e teclado; executar gates.
- [x] Publicar frontend HML com backup, conferir versão servida e preservar configurações existentes.

## Validação visual
Desktop 1280/1600 e celular 360/390, claro/escuro. Prévia de logo, nome, cores, densidade e ícones; tabelas de campos, conferência e painel administrativo. Capturas privadas sem dados pessoais.

## Testes e build
Testes significativos de persistência, conflito entre sessões, validação oculta entre abas, chaves de campos, carregamento e respostas obsoletas. Suite completa frontend, lint e build; backend existente reutilizado para smoke read-only e QA sintética.

## Resultado
687/687 testes frontend; 59 dirigidos (subconjunto); 104/104 integrações PostgreSQL em banco distinto do QA visual. Lint: zero erros e os mesmos 39 avisos do baseline. Build candidato aprovado; aviso anterior de tamanho do bundle permanece. `git diff --check` aprovado.

QA de logo válida/inválida, persistência, edição simultânea em duas abas, prévia local de cores/densidade, revisão antes/depois, nove catálogos e campos protegidos. Correção, valor adicional booleano, inativação e reativação testados com veículo fictício. ADMIN fictício impedido de entrar em parâmetros. Teclado/Escape e desktop 1280/1600 e mobile 360/390 conferidos, claro/escuro, sem overflow horizontal. Conferido um asterisco por campo no editor mobile. Lista de ícones recolhida para aproximar prévia e controles; controles de visibilidade com alvo de toque maior.

Produção e configurações HML permanecem idênticas ao fingerprint inicial (revisão 3). APIs 6969/PID2096 e 8000/PID5804 preservadas. Fonte `3c28261` publicada às 19:21:06 de 29/10/2026, somente frontend, entrada `index-C2Ck_Gb6.js`. SHA256 servido `0db166b05c924495ae1de05318f5e91669970782e612f4bd1af0768891137f8c`, conferido com o candidato. Tela autenticada HML, nova prévia compacta e retorno à revisão 3 sem publicação de preferências de teste conferidos. Console da guia nova sem erros/avisos.

Captura da publicação: `storage/backups/20261029-parameters-review/parameters-published.png`. Demais capturas identificam QA fictícia e estão na mesma pasta. Roteiro privado `publish-frontend.py --rollback` restaura o frontend anterior sem reiniciar APIs ou tocar em banco. Ambiente temporário encerrado ao concluir; guias originais do usuário preservadas.

## Pendências / decisões
A confirmação deve mostrar valores anteriores/novos e preservar edições quando outra sessão modifica parâmetros. A prévia deve ser local; nenhuma preferência escolhida no teste será publicada no HML ativo.

29/10: QA com duas abas reproduziu `CSRF_TOKEN_INVALID` ao reutilizar o token em memória depois da rotação do cookie pela outra aba. A recusa ocorre no middleware antes de executar o endpoint. Incluídos client.js, AuthContext e a mensagem de erro do Layout nesta mesma fase: renovar/repetir uma única vez apenas esse código explícito, jamais erros de permissão, origem, execução ou rede. Logout com falha deve destravar e permitir tentar novamente.

Desvio de build: primeiro build foi direcionado ao dist servido antes da conclusão dos gates. A entrada anterior foi imediatamente restaurada e seu SHA256 original confirmado. Builds seguintes usam exclusivamente frontend-candidate privado; nenhum dado ou configuração foi alterado por esse desvio.

## Rollback
Copiar assets anteriores e restaurar `frontend-before/index.html` por substituição atômica em `frontend/dist`. Código anterior recuperável pelo HEAD inicial. A fase não depende de rollback de banco.
