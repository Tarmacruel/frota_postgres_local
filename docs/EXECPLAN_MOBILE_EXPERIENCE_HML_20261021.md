# ExecPlan — Experiência mobile — homologação

## Objetivo
Entregar uma fase integrada de experiência mobile: navegação curta, busca e filtros progressivos, listas com resumo/detalhes, ações ao alcance do toque e modais com bom aproveitamento da tela. Somente HML.

## Estado inicial verificado
- Branch feature/vehicle-tags-hml, HEAD 6104f1d; working tree inclui etiquetas/tour/12 cores/exclusão já autorizados e publicados em HML; preservar.
- Baseline frontend 347 testes aprovados/64 arquivos; lint 0 erros/40 avisos; build HML aprovado na entrega anterior, antes desta fase.
- Backend 672 aprovados/109 ignorados, schema HML0055; não alterar backend/banco.
- Em 390 px, topbar usa três linhas, ações/filtros empurram registros para fora da primeira tela; cada linha empilha todas as colunas. Screenshot outputs/mobile-antes-veiculos.png.

## Direção visual e interação
Tese visual: interface institucional limpa, superfícies sólidas, azul como ação principal e tipografia legível para toque.
Conteúdo: navegação e contexto compactos → ação principal/busca → resumo dos registros → detalhes e ações sob demanda; sem hero.
Interações: abertura curta de navegação/ações, expansão de filtros e registros, entrada discreta de diálogos. Respeitar movimento reduzido.

## Arquivos previstos
Layout, PageHeader, ActionMenu, Pagination, componentes MobileFilters/ResponsiveRecord, listas operacionais centrais, main.jsx e CSS mobile centralizado; testes de comportamento e documentação.

## Alterações funcionais proibidas
Backend, banco, endpoints/payloads, permissões, status ou regras de negócio; produção; remoção de PDF/XLSX, anexos, assinatura, tour, módulos e ações existentes. Sem service worker ou cache offline de dados.

## Passos de implementação
- [x] Backup de fonte/build e fingerprints.
- [x] Shell compacto com ações secundárias acessíveis, Menu inferior e navegação por permissão.
- [x] Cabeçalhos e filtros progressivos; registros com resumo e expansão nas listas centrais.
- [x] Menus em painel inferior, diálogos e controles adequados ao toque; paginação mobile.
- [x] Testes/lint/build, QA claro/escuro/celular/tablet/desktop, publicação HML e isolamento de produção.

## Validação visual
390 px e 360 px; tablet 820 px; desktop >=1366 px. Veículos/Posses/Condutores/Manutenções, navegação a demais módulos, busca, filtros, etiqueta, formulário, menus e paginação. Não gravar dados de negócio durante QA. Provar manutenção de todas as ações e ausência de overflow horizontal global.

## Testes e build
Suíte final: **353 testes aprovados em 65 arquivos**. Direcionados finais: 50 (shell/componentes/tour), 39 (abastecimentos/componentes) e 2 de Condutores; há sobreposição com a suíte. Lint 0 erros/40 avisos anteriores. Build HML e git diff --check aprovados. Testes novos cobrem expansão sem recriar dados, preservação de valores/handlers de filtro/relatório, fechamento/foco de ações e conta e abertura do menu inferior. Teste anterior atualizado para a nova composição da barra inferior, mantendo Condutores no menu completo.

QA de navegador: 360/390 px sem overflow global, 820 px com tabela rolável no contêiner e 1366 px com células completas e expansor oculto; claro/escuro; busca global encontrou fixture TST0F20; filtros e detalhes expandem; painel inferior e gestão de etiquetas funcionam; catálogo mantém 12 cores. Novo veículo e encerramento com fotos abertos e cancelados, sem salvar dados. Veículos/Posses/Condutores/Manutenções/Sinistros/Multas/Abastecimentos possuem dados reais de HML conferidos; Empréstimos e Ordens abertas foram conferidos no estado vazio existente. Console sem erros. Ajuste final de CSS para manter o tamanho dos filtros desktop conferido no build e navegador.

Nove assets públicos comparados por SHA-256 com o build. Readiness dos dois ambientes saudável; backend integralmente idêntico ao preflight; schema HML permanece 0055; HEAD/árvore/configuração/index/schema de produção preservados. Evidências e scripts no backup, capturas em outputs/mobile-*.png do workspace da tarefa.

## Resultado
Publicado somente em **https://testefrota.sirel.com.br**. Barra superior mobile em uma linha, busca por ícone, ações da conta nas iniciais, barra inferior com Menu e navegação completa, cabeçalhos/filtros progressivos, resumo/detalhes nas nove listas operacionais, ações em painel inferior, formulários em uma coluna e modais com cabeçalho fixo e corpo rolável. Controles de 44–48 px, inputs de 16 px, safe areas e movimento reduzido. O dashboard recebeu espaçamento e atalhos em lista. Tour das etiquetas explica os caminhos mobile. Desktop preserva a apresentação tabular e todas as ações. Nenhuma dependência ou migration adicionada.

## Pendências / decisões
Melhoria incremental em uma fase mobile; desktop mantém a tabela e seus dados. Dados secundários permanecem acessíveis em Ver detalhes; ações operacionais continuam visíveis. Sem solicitar nova aprovação para o escopo já autorizado.

QA realizado em navegador com larguras emuladas, sem ensaio em aparelho físico ou teclado virtual nativo. Relatórios PDF/XLSX, permissões e assinaturas cobertos pelos testes existentes; não houve nova inspeção binária dos relatórios nesta fase. Telas administrativas recebem shell/cabeçalho/diálogos e controles globais; o novo resumo expansível foi aplicado às listas operacionais citadas, sem reescrever as tabelas administrativas.

## Rollback
storage/backups/20261021-mobile-experience/source-before.zip e frontend-before. Restaurar apenas arquivos desta fase e publicar o build anterior usando a manutenção HML; não reverter as alterações anteriores de etiquetas. Nenhuma migration.
