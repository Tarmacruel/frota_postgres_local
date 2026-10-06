# Fase 3 — dashboard

Entrega em 30/09/2026, exclusivamente na branch `feature/frontend-evolution-hml`, a partir do commit `6d5dab9`.

## Resultado

O dashboard passou a abrir com uma saudação curta e contextual, sem o bloco alto anterior. Os quatro indicadores reutilizam `StatCard`, distinguem situação por ícone e cor semântica e mantêm os mesmos cálculos: veículos ativos, em manutenção, ativos sem condutor e manutenções abertas.

As ações rápidas foram condensadas em uma faixa de quatro atalhos. A filtragem continua baseada em `canView` e o texto de cadastro/consulta continua baseado em `canCreate('vehicles')`. Pendências de manutenção agora ocupam a área de maior peso visual; a leitura diária preserva totais de veículos, posses ativas e inativos. Os atalhos de usuários e auditoria continuam exclusivos de administradores, e o resumo do perfil continua refletindo `canWrite`.

## Contrato preservado

O carregamento mantém exatamente três fontes existentes, sem endpoint ou chamada adicional:

- `GET /vehicles`, com o mesmo limite e somente quando há visualização de veículos;
- `GET /maintenance`, somente quando há visualização de manutenção;
- `GET /possession/active`, somente quando há visualização de posses.

Nenhum cálculo, parâmetro de API, rota de destino ou regra de permissão foi ampliado. Backend, shell global, páginas de negócio e produção não foram alterados.

## Arquivos de aplicação

- `frontend/src/pages/DashboardPage.jsx`: nova composição visual, conteúdo mais curto e adoção de `StatCard`.
- `frontend/src/styles/frontend-evolution.css`: estilos aditivos e restritos a `.dashboard-*`, com respostas para quatro, duas e uma coluna.
- `frontend/src/pages/DashboardPage.test.jsx`: verifica as três chamadas, indicadores calculados e ocultação de ações sem permissão.

## Verificação

- Teste direto do dashboard com pool `forks`: 2 aprovados.
- `npm run test`: 178 aprovados e 15 falhas nas suítes preexistentes de assinatura, ordem de abastecimento e aviso de empréstimos; nenhuma falha no dashboard.
- `npm run test -- --pool=forks`: 193 aprovados em 37 arquivos.
- `npm run lint`: zero erros e 46 avisos preexistentes.
- `npm run build`: aprovado, 1008 módulos transformados.
- `git diff --check`: aprovado.

Capturas locais ignoradas em `evidence/phase-3/`: claro e escuro em 1366×768. A inspeção real confirmou a faixa de KPIs, ações rápidas, prioridade das pendências, leitura do dia, equivalência visual dos temas e manutenção do shell. O único erro de console foi o `401` esperado da consulta de sessão anterior ao login.

## Limites

Somente o dashboard foi evoluído. As páginas operacionais permanecem para a Fase 4. As falhas do runner padrão e os 46 avisos de lint permanecem documentados como baseline anterior; a execução isolada em `forks` aprova toda a suíte.
