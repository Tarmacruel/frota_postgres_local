# ExecPlan — identidade da navegação — homologação

## Objetivo
Refinar menu lateral e ícones de todas as abas a partir dos comentários do usuário em23/10: desenhos distintos, legibilidade, acabamento consistente e estados claros. Entrega visual somente em homologação.

## Estado inicial verificado
- Branch `feature/contracts-balances-hml-20261022`, HEAD `b934c77`, working tree limpo.
- Frontend React18/Vite; SVGs locais em AppIcon e CSS em camadas. Menu repete carros, canetas e documentos em módulos diferentes; grid estica grupos e aumenta irregularmente a primeira linha.
- Baseline imediatamente anterior: frontend409 testes/71arquivos; lint0erros/39avisos; build HML aprovado. Backend permanece fora do escopo.
- Referências: screenshots anotados do usuário e `references/target/01-design-system-board.png`; direção operacional institucional preservada.

## Direção visual e de interação
- Tese visual: navegação azul-marinho com pictogramas próprios em dois tons da mesma família, superfície calma, tipografia nítida e acabamento discreto.
- Conteúdo: marca oficial no cabeçalho; grupos e rótulos existentes; identidade do módulo no ícone e no cabeçalho da rota; conta e ações no rodapé. Sem novos grupos ou funcionalidades.
- Interação: realce curto de fundo/ícone no hover, indicador de seleção com transição contida e modo compacto/drawer existentes; respeitar movimento reduzido. Sem animação de entrada que reorganize as rotas.

## Arquivos previstos
Componente de ícones de navegação, Layout, estilos centralizados da navegação, import do CSS e testes existentes do shell; status e este plano.

## Alterações funcionais proibidas
Sem backend, schema, banco, endpoints, dados de negócio ou configuração de produção. Preservar rotas, nomes, permissões, badges, atalhos mobile, pesquisa, conta, temas, foco, teclado e fluxos de documentos/assinaturas.

## Passos de implementação
- [x] Família SVG local com um desenho por módulo, sem dependência nova.
- [x] Refinar lateral, estados, marca, rodapé, compacto e drawer; manter toque e foco visíveis.
- [x] Reutilizar a identidade no cabeçalho desktop e na navegação mobile.
- [x] Regressões do shell/permissões, suíte frontend completa, lint e build.
- [x] Backup frontend/fonte, publicação exclusiva HML e verificação de assets/configurações/saúde.
- [x] Inspeção desktop/mobile, claro/escuro, compacto e teclado; capturas, documentação e commit.

## Validação visual
Desktop1366×768 e viewport original2268×1045; tablet820; mobile390/360. Conferir todos os módulos, rótulos longos, scroll do menu, conta fixa, modo compacto, badges, foco e Escape no drawer. Comparar com captura anterior; não alterar dados ao visitar rotas.

## Testes e build
Testes existentes do Layout para navegação, permissões, foco/drawer, conta/temas, modo compacto e atalhos. Verificação adicional de ícones distintos e título/seleção correspondentes. Executar test/lint/build do frontend, sem testes desnecessários de regras de negócio.

## Resultado
Publicado exclusivamente na homologação em23/10/2026.

- `ModuleIcon.jsx`:17 desenhos próprios para os destinos e um ícone de criação de ordem no atalho mobile; canvas24, traço1,65 e preenchimento secundário da mesma cor. Carro, transferência, chave, volante, ferramenta, ocorrência, multa, bomba, ordem com relógio, organograma, posto, contrato, gráfico, importação/exportação, usuários/acesso e inspeção permanecem visualmente distintos.
- `Layout.jsx`: ícones exclusivos nos links e barra mobile, identidade da rota também no cabeçalho desktop, indicador lateral/chevron selecionado, título completo no compacto e botão interno para fechar o drawer. Rotas, rótulos, permissões, badges, busca, temas e ações de conta mantidos.
- `navigation.css`, importado depois das camadas anteriores: lateral248px/compacto80px, ícones22px, grupos sem estiramento, linhas40px no desktop e alvos48px no drawer, marca/conta fixas e lista rolável. Altura considera a faixa de homologação, corrigindo o rodapé que ultrapassava a janela anterior. Hover/seleção e recolhimento têm transições curtas com tratamento de movimento reduzido.
- Suíte frontend completa: **409 aprovados em71 arquivos**. Layout direcionado: **13 aprovados**, incluindo verificação de desenhos distintos nos links e identidade no cabeçalho. Lint: **0 erros/39 avisos anteriores**. Build HML aprovado; aviso anterior de bundle acima650kB mantido. Nenhuma dependência ou arquivo de backend alterado.
- Backup de fonte `b934c77`, índice anterior e configurações em `storage/backups/20261023-navigation`. Publicação somente frontend pelo script HML existente. **68 tabelas idênticas**, configurações/backend e PID da API preservados, nove assets públicos conferidos por SHA256, readiness dos dois ambientes aprovada. Sem migration, restauração, reinício ou produção publicada.
- QA autenticado:17 links e17 desenhos diferentes no navegador; Veículos/fleet e Cadastros/registry coincidem com o cabeçalho. Desktop1366×768 e viewport original2268×1045, compacto, tablet820 e mobile390/360 conferidos. Marca/conta dentro da janela; lista rola mantendo todos os destinos; tooltip nativo do compacto identifica o nome completo. Foco visível em Postos por Tab; Escape devolve o estado do Menu, novo X fecha o drawer e rolagem de fundo fica bloqueada enquanto aberto.
- Claro/escuro, barra mobile com os novos pictogramas, alvos próximos de48px, ausência de overflow horizontal nas larguras móveis e console sem erros. Viewport original, modo expandido, tema claro e rota inicial restaurados. Sem gravação de dados de negócio. Limite: inspeção de largura pelo navegador, sem aparelho físico.
- Capturas privadas: `before-desktop.png`, `desktop-light.png`, `desktop-1366-cadastros.png`, `desktop-dark-compact.png`, `mobile-dark-drawer.png`, `mobile-light-360.png` e `navigation-proof.png` (recorte da lateral com o cabeçalho da rota).

## Pendências / decisões
A identidade individual vem de pictogramas próprios e contexto da rota; usar uma paleta compartilhada evita multiplicar cores sem significado. Incremento do shell autorizado pelo usuário, sem iniciar refatoração de outras páginas.

Nenhuma pendência de ativação. Validar a preferência de desenho com os usuários durante a homologação antes de qualquer publicação futura em produção.

## Rollback
Preservar índice frontend anterior e fonte `b934c77` em backup privado. Reverter somente componentes/estilos e republicar frontend HML. Nenhum reinício de API ou restauração de banco é necessário.
