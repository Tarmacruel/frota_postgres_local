# Checklist de acessibilidade — fluxo crítico

Referência: WCAG 2.1 AA e eMAG. Revisão de código/RTL em 2026-07-13; a homologação assistiva institucional continua recomendada.

| Verificação | Evidência | Estado |
|---|---|---|
| Labels associados a campos, inclusive rota inicial, justificativa e declaração | componentes de formulário e testes RTL | Conforme |
| Foco inicial, contenção de Tab, Escape e retorno de foco nos modais | `Modal`, encerramento e `GuidedTour` | Conforme |
| Tour pode ser ignorado, navegado para frente/trás e reaberto | 2 testes do `GuidedTour` | Conforme |
| Destaque do tour não depende só de cor | alvo recebe contorno, sombra e o diálogo contém título/texto/posição | Conforme |
| Estado assíncrono e erros 401/403/409/422 possuem texto e `aria-live` | `PossessionPage`, formulários e testes | Conforme |
| Duplo submit impedido e botão comunica processamento | fluxos de criação, rota e encerramento | Conforme |
| “Registrar retorno da rota” distinto de “Encerrar posse” | títulos, ajuda contextual e timeline | Conforme |
| Reordenação de destinos/colunas por botões acessíveis | subir/descer com rótulo; não depende de drag-and-drop | Conforme |
| Tabelas têm cabeçalhos e status textual | timeline e relatórios | Conforme |
| Foco visível e área mínima de ação em mobile | CSS compartilhado e media queries | Conforme na revisão |
| Zoom/reflow em 320 px e desktop | layout mobile-first sem largura fixa no tour | Conforme na revisão |
| Movimento respeita preferência reduzida | `prefers-reduced-motion` desativa transições do tour | Conforme |
| Contraste de texto/controles | variáveis visuais existentes, overlay/diálogo com contraste reforçado | Sem achado automático; validar em homologação visual |
| Leitor de tela real (NVDA/JAWS) | não disponível no ambiente automatizado | Pendente não bloqueante; teste institucional recomendado |

## Roteiro de teclado reproduzido

1. Abrir `/posses` e percorrer o tour com Tab/Enter.
2. Usar “Pular tour” ou Escape e confirmar retorno do foco ao botão que o abriu.
3. Criar posse com rota opcional, chegar ao conflito 409 e preencher justificativa sem mouse.
4. Abrir rotas, incluir/reordenar destinos, registrar retorno e observar o anúncio de sucesso.
5. Tentar encerrar com rota aberta e confirmar mensagem textual de bloqueio.
6. Encerrar sem rota aberta, percorrer integralmente a declaração e marcar o checkbox inicialmente desmarcado.
7. Abrir “Mais opções”, selecionar e reordenar colunas pelos botões, gerar preview/download.

Os 24 testes frontend passaram em cópia local controlada; avisos do React Router referem-se à futura v7 e não alteram o fluxo atual.
