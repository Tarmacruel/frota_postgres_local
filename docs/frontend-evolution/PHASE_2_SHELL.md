# Fase 2 — shell global

Entrega em 30/09/2026, exclusivamente na branch `feature/frontend-evolution-hml`, a partir do commit `1880e58`.

## Resultado

O shell passou a usar uma sidebar institucional escura e estável nos temas claro e escuro. A navegação mantém os grupos Visão geral, Operacional e Gestão, todos os itens condicionados às permissões e o contador pendente de Empréstimos. O item ativo usa superfície azul e texto branco; hover, foco e ícones mantêm contraste sem acrescentar informação ornamental.

A topbar ficou compacta, com título da rota, busca global, notificações administrativas, assinaturas pendentes, tema e identidade do usuário em grupos claros. O cartão do usuário continua na sidebar com alteração de senha e saída. O tema continua em `data-theme` e no mesmo `localStorage`; a preferência da sidebar também permanece no armazenamento existente.

Em desktop, a sidebar usa 228 px e 72 px recolhida. Abaixo de 1180 px ela vira drawer e mantém o botão de abertura, a navegação móvel e uma área externa para fechamento. O drawer respeita a faixa de homologação. Foram preservados o conteúdo das páginas, rotas, APIs, permissões, modais e integrações.

## Arquivos de aplicação

- `frontend/src/components/Layout.jsx`: agrupamentos semânticos das ações e da conta, identidade compacta na topbar e nome acessível da navegação; nenhuma regra condicional removida.
- `frontend/src/styles/frontend-evolution.css`: estilos aditivos e restritos ao shell para sidebar, topbar, busca, superfícies, estados, temas e breakpoints.
- `frontend/src/components/Layout.test.jsx`: contrato de navegação, item ativo, identidade, tema, drawer e persistência do recolhimento.

Nenhuma página de negócio, `App.jsx`, API, backend, dependência ou configuração de produção foi alterada.

## Verificação

- Teste direto do Layout com pool `forks`: 8 aprovados.
- `npm run test`: 175 aprovados e 16 falhas, exatamente as categorias preexistentes da Fase 1.
- `npm run test -- --pool=forks`: 191 aprovados em 36 arquivos.
- `npm run lint`: zero erros e 46 avisos preexistentes.
- `npm run build`: aprovado, 1001 módulos transformados.

Capturas locais ignoradas em `evidence/phase-2/`: claro e escuro em 1366×768, drawer fechado/aberto em 1024×768 e vista em 768×1024. A inspeção confirmou busca, controles de sistema, usuário, estado ativo, equivalência dos temas e fechamento do drawer. Nenhuma operação de negócio foi gravada durante a validação.

## Limites

O dashboard aparece nas capturas apenas para contextualizar o shell e não foi reorganizado. A Fase 3 não foi iniciada. As 16 falhas do runner padrão e os 46 avisos de lint continuam documentados como baseline anterior.
