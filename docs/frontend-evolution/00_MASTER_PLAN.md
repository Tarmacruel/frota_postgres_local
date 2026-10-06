# Plano mestre — evolução do frontend Frota PMTF

## Princípio

Este é um **redesign evolutivo**. O objetivo é aumentar orientação, legibilidade e consistência sem transformar o sistema em outro produto e sem tocar na lógica de negócio.

A ordem foi definida para reduzir risco: primeiro tokens/componentes, depois shell, depois uma tela piloto, depois módulos por família.

## Fase 0 — Baseline e segurança

**Objetivo:** provar o estado inicial e separar a iniciativa em branch própria de homologação.

Passos:

1. Confirmar repositório, branch, HEAD e `git status`.
2. Conferir se o working tree local coincide com a branch remota e registrar divergências.
3. Criar uma branch de trabalho a partir da branch HML atual, sugerida: `feature/frontend-evolution-hml`.
4. Rodar baseline de `test`, `lint` e `build` no frontend.
5. Registrar screenshot de Início, Veículos e Posses em claro/escuro antes de alterações.
6. Criar `docs/frontend-evolution/STATUS.md` a partir do template.

**Não editar UI nesta fase.**

**Aceite:** baseline documentado e branch limpa.

---

## Fase 1 — Fundação visual e componentes base

**Objetivo:** criar a camada de design system sem reestruturar páginas.

Entregas:

- tokens semânticos claro/escuro;
- escala de espaçamento 4/8/12/16/20/24/32;
- raios 8/10/12/16;
- sombras discretas;
- componentes `PageHeader`, `StatCard`, `StatusChip`, `VehicleThumbnail`, `IconButton`, `ActionMenu`;
- assets SVG genéricos por tipo de veículo;
- import da nova folha de estilos após `styles.css`;
- testes básicos dos novos componentes.

**Aceite:** aplicação visualmente quase igual antes de os componentes serem adotados; nenhum fluxo alterado; quality gates verdes.

---

## Fase 2 — Shell global

**Arquivos-alvo principais:** `Layout.jsx` e estilos globais.

Entregas:

- sidebar com largura/hierarquia coerentes e estado ativo mais claro;
- grupos `Visão geral`, `Operacional`, `Gestão` preservados;
- topbar compacta com título da rota e busca global;
- usuário/tema/notificações preservados;
- superfícies do tema claro menos “lavadas”;
- dark mode com fundo, surface e borda claramente diferenciados;
- nenhum item de navegação removido.

**Aceite:** todas as rotas continuam acessíveis de acordo com permissão e o shell funciona em desktop e largura reduzida.

---

## Fase 3 — Dashboard / Início

Tela piloto para consolidar o padrão.

Entregas:

- saudação/título sem hero excessivamente alto;
- 4 KPIs visuais com ícone, valor e contexto;
- ações rápidas em cards compactos;
- pendências recentes com maior prioridade;
- leitura rápida do dia;
- atalhos administrativos condicionais preservados;
- tema claro e escuro equivalentes.

Use `references/target/02-telas-alvo-board.png` como direção primária.

**Aceite:** sem aumento de chamadas API e sem mudança na origem dos indicadores.

---

## Fase 4 — Módulos operacionais centrais

Ordem recomendada:

1. Veículos
2. Posses
3. Condutores
4. Manutenções
5. Empréstimos, somente depois de localizar sua implementação real no working tree

Padrão:

- `PageHeader` consistente;
- filtros em toolbar única;
- métricas/contadores discretos;
- tabela com cabeçalho sticky quando útil;
- miniatura do veículo junto de placa/identificação;
- ações primárias visíveis e secundárias no `ActionMenu`;
- status por `StatusChip`;
- paginação preservada;
- PDF/XLSX preservados.

**Posses:** priorizar `Registrar retorno`/`Encerrar posse` conforme estado, manter ações de termos, retificação e rotas acessíveis no overflow.

---

## Fase 5 — Abastecimento, ordens, sinistros e multas

Telas:

- Abastecimentos
- Histórico de abastecimentos
- Ordens abertas
- Sinistros
- Multas

Entregas:

- distinguir ação crítica, principal e consulta;
- reduzir fileiras de botões repetitivos;
- deixar prazos e expirações fáceis de escanear;
- manter links públicos, comprovantes, PDFs, assinaturas e retificações;
- tabelas densas, porém legíveis.

---

## Fase 6 — Gestão e administração

Telas:

- Cadastros
- Postos
- Processos de pagamento e todas as abas
- Análises
- Importar/Exportar
- Usuários
- Auditoria

Atenção especial:

- `PaymentProcessesPage.jsx` é grande e deve ser tratado por abas, não refeito de uma vez;
- Auditoria precisa preservar densidade e conteúdo técnico;
- Análises deve manter gráficos e significado das cores;
- Importar/Exportar precisa manter estados de lote/revisão/erro explícitos;
- Usuários deve destacar perfis/status sem aumentar exposição de dados.

---

## Fase 7 — QA, responsividade e acabamento

Checklist:

- desktop 1366x768, 1600x900 e 1920x1080;
- viewport reduzido/tablet;
- tema claro e escuro;
- keyboard focus visível;
- overflow horizontal controlado em tabelas;
- modais não cortados;
- nenhuma ação inacessível;
- contrastes adequados;
- comparação com screenshots target;
- `test`, `lint`, `build`;
- registrar pendências separadamente, sem “polir” lógica funcional.

## Fora do escopo

- reescrita do backend;
- mudança de banco;
- troca de React/Vite;
- adoção de framework UI pesado;
- alteração de autenticação/permissões;
- mudança de regras de posse, abastecimento, assinatura ou pagamento;
- publicação em produção.
