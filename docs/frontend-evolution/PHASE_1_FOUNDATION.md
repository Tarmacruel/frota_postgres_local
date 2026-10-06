# Fase 1 — fundação visual

Entrega em 30/09/2026, exclusivamente em D:\FROTAS\frota_emprestimos_testes, branch feature/frontend-evolution-hml, a partir de a71c9c0 limpo.

## Implementação

- frontend/src/styles/frontend-evolution.css: tokens semânticos --ui-*, temas claro/escuro, espaçamento, tipografia, bordas, estados, foco e redução de movimento. Seletores restritos aos novos componentes; não substitui tokens legados. Raios menores existentes preservados, adaptando o starter-kit à preferência expressa pelo usuário.
- frontend/src/main.jsx: importa a folha após os dois CSS existentes.
- frontend/src/components/ui/: PageHeader (título/descrição/ações), StatCard (valor, inclusive zero, e carregamento), StatusChip (texto e tom), VehicleThumbnail (tipo e fallback), IconButton (nome acessível obrigatório) e ActionMenu (ações ocultas/desabilitadas e callbacks). Exportações em index.js.
- ActionMenu usa portal para evitar recorte por contêineres, posição calculada limitada à viewport, setas/Home/End, Escape, Tab/Shift+Tab, retorno de foco e fechamento externo. Escape não fecha o modal pai. Nenhuma regra de domínio incorporada.
- frontend/public/vehicle-thumbnails/: 11 SVGs genéricos do kit. Mapeamento normaliza tipos, respeita BASE_URL e oferece fallback sem marca.
- frontend/src/test/frontendEvolutionComponents.test.jsx: 25 casos de contratos, miniaturas, zero/carregamento, nome acessível, teclado, foco, itens ocultos/desabilitados e integração com modal existente.

Nenhum componente adotado em páginas nesta fase. Sem alterações em Layout, App, CSS legado, backend, banco, dependências, runner ou configuração de produção.

## Verificação

npm run test: 174 aprovados / 16 falhas, 36 arquivos; mesmas falhas da Fase 0 em DocumentSignaturePanel, CertificateSignatureFlow, Layout, FuelSupplyOrderCreateForm e usePendingVehicleLoans. npm run test -- --pool=forks: 190 aprovados em 36 arquivos. Lint: zero erros e 46 avisos preexistentes. Build aprovado. A configuração oficial não foi alterada.

Capturas locais em evidence/phase-1/: inicio-light/dark, veiculos-light/dark, posses-light/dark, components-light/dark e components-tablet. Em 1366×768, cinco telas existentes são idênticas pixel a pixel ao baseline. Veículos claro difere em 415 pixels (0,0396%), no retângulo (19,57)–(41,84), correspondente ao ícone superior lateral; sem alteração de layout/conteúdo funcional. Componentes isolados conferidos em ambos os temas e em 768×1024; todas as miniaturas carregaram. Nenhum fluxo mutante de negócio executado.

A galeria temporária usou dados ilustrativos, foi compilada separadamente e retirada da pasta pública após a conferência; seu build foi arquivado localmente em storage. Não é uma rota do produto. Logs, comparação de pixels e galeria ficam ignorados em storage/loan-tests/frontend-evolution-phase1/; capturas também são evidências locais ignoradas.

## Limites e continuidade

A aparência das páginas existentes permanece preservada. A fundação está disponível para adoção gradual, mas a Fase 2 não foi iniciada. As 16 falhas do runner padrão e os 46 avisos de lint permanecem pendências anteriores, documentadas sem ampliação de escopo.
