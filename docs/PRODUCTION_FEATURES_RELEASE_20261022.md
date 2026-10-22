# Publicação de etiquetas, experiência mobile e CNH — 22/10/2026

Publicação autorizada expressamente pelo usuário nesta conversa e concluída em `https://frota.sirel.com.br`. Homologação continua em `https://testefrota.sirel.com.br`, isolada da produção.

## Entregue

- Etiquetas com catálogo pessoal, autoria e observação compartilhadas, filtros, consulta nas posses e seletores, exportação, histórico e auditoria. Não alteram o status do veículo nem bloqueiam operações.
- Tour automático no primeiro acesso por conta, com opção de rever; paleta com 12 cores e prévia; arquivamento e exclusão lógica protegida quando houver marcações ativas.
- Navegação mobile com barra inferior e menu completo conforme permissões, controles de toque, filtros/opções progressivos, registros expansíveis, ações e formulários adaptados. Tabelas desktop preservadas.
- Número da CNH em cadastro, edição, lista e exportações; avisos informativos de número/validade ausentes ou CNH vencida no seletor operacional. A edição abre em outra aba, com foco no campo e rascunho preservado. O campo já existia no banco.
- Fotos durante e após o encerramento de posses continuam disponíveis pela publicação anterior #70.

## Versões e verificações

PR [#71](https://github.com/Tarmacruel/frota_postgres_local/pull/71): candidato `511220a562674266fdc354f209bbb90bf42c3ed3`, merge `8158a243d35f6b29f578deef5bc793c1ef02cc71`. PR [#72](https://github.com/Tarmacruel/frota_postgres_local/pull/72): correção do deslocamento da barra mobile quando a faixa de homologação está ausente; merge `da64c60d564f90e4d2b0ff5571f4ec722c5d9c3b`. Cada merge teve a árvore conferida contra o candidato preparado.

- Backend local: 672 aprovados, 109 ignorados e oito avisos existentes. Frontend: 371 aprovados em 66 arquivos; lint sem erros e 40 avisos existentes; builds preparados com as configurações próprias de cada ambiente.
- Os checks obrigatórios backend-tests, frontend-tests e container-smoke passaram nos dois PRs. O smoke executou as migrations em PostgreSQL descartável. Deploy automático permaneceu desabilitado; nenhum requisito de main foi contornado.
- Schema de produção atualizado de 0053 para 0055 pelas migrations aditivas de etiquetas. Fingerprints de todas as 57 tabelas existentes idênticos antes/depois, com a API parada. As duas novas tabelas estavam vazias após migrar; nenhum dado de homologação foi transferido.
- Dump inicial consistente com 313 veículos, 334 condutores, 2027 posses, oito fotos e 48 usuários. São contagens do backup; a operação normal pode gerar novos registros após a ativação.
- Configurações preservadas por SHA256. Nove assets finais e index públicos idênticos ao build preparado. Readiness de produção e homologação saudável; endpoints novos e fotos retornam 401 sem autenticação.
- Probes de veículos, posses ativas/encerradas, condutores, catálogo e tour em transação PostgreSQL somente leitura. Foto histórica servida; fixture TST0F20 ausente.

## Operação e inspeção visual

Ativação principal entre 07:39:22 e 07:39:44 (America/Sao_Paulo). Apenas API 8000 reiniciada, após dump final consistente e comparação histórica. Watchdog desabilitado brevemente e reativado em finally; estado final Ready. PostgreSQL, frontend preview, Cloudflare e homologação não reiniciados.

O ajuste CSS adicional foi publicado entre 07:45:53 e 07:45:54 sem reiniciar API. Em produção, o cabeçalho mobile começa em 0px e não sobrepõe o título; em homologação, respeita a faixa de 26px. QA em desktop e mobile (355px CSS no Edge com zoom do usuário; homologação 390px), claro/escuro. As fases de homologação também têm QA registrado para 360/390/820/1366px. Limite: teste responsivo em navegador, sem aparelho físico ou teclado virtual nativo.

Tour inicial observado; catálogo com 12 opções e prévia mudando conforme nome/cor. Campo CNH conferido em criação; aviso na posse abriu a edição existente, focou Número da CNH e preservou o rascunho. Formulários cancelados e aba de QA fechada. Nenhuma etiqueta, posse ou cadastro de teste foi gravado em produção; apenas o reconhecimento do tour da conta usada na QA.

## Backup, evidências e rollback

Backup privado: `D:/FROTAS/05-BACKUPS/producao/20261022-etiquetas-mobile-cnh`, correspondente a `storage/backups/20261022-etiquetas-mobile-cnh` no checkout de produção. Contém dumps inicial/final, anexos, configurações, build anterior, bundle Git, fontes dos candidatos, logs, fingerprints, gates e scripts de ativação. O subdiretório `frontend-spacing` preserva o build anterior à correção CSS. Credenciais e dados privados não entram no repositório.

Evidências locais adicionais: `C:/Users/078364/Documents/Codex/2026-10-20/cha/outputs/production-tour-20261022.png`, `production-palette-20261022.png` e `production-mobile-final-20261022.png` no mesmo diretório.

Para rollback de aplicação, usar o código/build anteriores e reiniciar somente API se houver mudança de backend. Manter schema aditivo, etiquetas, histórico e novas gravações. Não fazer downgrade nem restaurar banco automaticamente. O backup consistente permite recuperação assistida se necessária. Nenhuma pendência funcional desta publicação.
