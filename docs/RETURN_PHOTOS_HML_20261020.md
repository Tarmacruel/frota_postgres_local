# Frota Sirel — fotos na devolução e organização local

Aplicado em 20/10/2026, exclusivamente na homologação: [abrir Posses](https://testefrota.sirel.com.br/posses).

## Comportamento entregue

O formulário **Encerrar posse e registrar devolução** agora contém **Fotos da devolução (opcional)**, após as condições do veículo e antes da declaração. Permite selecionar várias imagens, escolher a câmera pelo seletor do celular, visualizar miniaturas, ampliar e remover arquivos antes de confirmar. As imagens e a confirmação são gravadas na mesma operação; uma falha de gravação reverte o banco e limpa os arquivos preparados. Os campos e a seleção permanecem na tela quando a API retorna erro.

Limites: JPG, PNG e WEBP; 10 fotos; 8 MiB por foto; 32 MiB no total. O servidor verifica quantidade, tamanho e assinatura de formato, reutilizando a validação existente. Não há exigência de geolocalização para anexar fotos da galeria.

A consulta de fotos identifica **Foto da devolução · versão 1** e distingue data de envio de data de captura. Fotos anteriores mantêm a etapa não informada. O novo registro inclui autor, confirmação correspondente e hash do conteúdo. Confirmações com fotos usam payload canônico v2 com manifesto das evidências; os registros históricos e seus hashes permanecem intactos. O fluxo JSON sem fotos continua aceito. O módulo Sinistros mantém seu fluxo próprio.

## Ambientes identificados

| Ambiente | Caminho técnico real | Portas | Acesso organizado |
| --- | --- | --- | --- |
| Produção | `D:\FROTAS\frota_certificado_homologacao` | API 8000; frontend 3000; banco 5432 | `D:\FROTAS\01-PRODUCAO` |
| Homologação | `D:\FROTAS\frota_emprestimos_testes` | aplicação 6969; banco isolado 5441 | `D:\FROTAS\02-HOMOLOGACAO` |

Em `D:\FROTAS`, foram criadas as pastas **01-PRODUCAO**, **02-HOMOLOGACAO**, **03-RELEASES**, **04-LEGADO**, **05-BACKUPS** e **06-FERRAMENTAS**, com junções NTFS para código, anexos, logs, releases, cópias antigas, backups e ferramentas. Os caminhos técnicos antigos foram preservados para manter serviços, tarefas, worktrees Git, virtualenvs e configurações funcionando. As junções são acessos à mesma origem, não cópias.

O mapa está em `D:\FROTAS\LEIA-ME-AMBIENTES.md`, com inventário em `AMBIENTES.json` e consulta de saúde em `STATUS.ps1`. A pasta de cada ambiente tem identificação e atalho para seu endereço público. A homologação tem `MANUTENCAO.ps1` com ações `status`, `start`, `restart`, `migrate` e `build`. O reinício valida PID, instante de criação e linha de comando antes de encerrar somente a API HML; preserva o PostgreSQL. O comando de build usa configuração explícita de homologação e mantém a faixa amarela.

Foi corrigida uma incompatibilidade da verificação de PID do script original `scripts/loan-tests.ps1`: o PowerShell 7 converte datas JSON automaticamente, enquanto o Windows PowerShell 5 mantém strings. A comparação agora usa datas normalizadas, preservando a proteção contra reutilização de PID.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Backend completo | 637 aprovados, 109 ignorados; 8 avisos de depreciação |
| Frontend completo | 320 aprovados, 62 arquivos |
| Testes dirigidos da interface | 20 aprovados |
| Lint | 0 erros, 40 avisos já existentes |
| Build HML | Aprovado; aviso de tamanho de chunk acima de 650 kB |
| Banco de homologação | Migration aditiva `0053_possession_return_photos` aplicada sobre `0052_analytics_alert_workflow` |
| Teste integrado público | Posse fictícia 1589, veículo `TST0F20`, encerrada com imagem ilustrativa; foto consultada pela galeria |
| Integridade do arquivo | 21.205 bytes; SHA-256 igual ao hash gravado |
| Acesso sem autenticação à foto | HTTP 401 |
| Fotos históricas | As 7 fotos anteriores foram preservadas com etapa não especificada |
| Visual | Temas claro/escuro; largura CSS de 390 px, sem overflow horizontal; seletor de arquivos acessível no layout móvel |
| Publicação | HTML e assets públicos conferidos por hash contra o build local |
| Produção | HEAD Git, working tree, configuração e índice do frontend sem alterações; readiness público saudável |

Os 109 testes ignorados não são apresentados como executados. A câmera foi disponibilizada pelo seletor de arquivos; a captura em aparelho físico não foi testada. Interrupção abrupta do processo durante escrita de arquivo pode exigir reconciliação de arquivos órfãos; a limpeza de falhas tratadas foi testada.

Foi mantida a posse fictícia **1590** como demonstração ativa do campo de fotos, no mesmo veículo `TST0F20`. As seleções usadas na revisão visual foram canceladas; não foram anexadas a essa segunda posse. Nenhum registro operacional real foi encerrado durante a validação.

## Código, backups e manutenção

Alterações locais na branch `feature/fotos-devolucao-hml`, na origem técnica de homologação. Sem commit ou push nesta etapa. Arquivos centrais: endpoint/parser de encerramento, modelo/schema de fotos, serviço de devolução, novo serviço de evidências, migration 0053, modal e novo seletor de fotos, página de Posses, estilos e testes. Também foram acrescentados o script de publicação do frontend HML e a configuração local de build `.env.homologation.local`.

Backups em `D:\FROTAS\05-BACKUPS\homologacao\20261020-fotos-devolucao`: dump consistente antes da janela, dump com API HML parada, código-base e frontend anterior. A configuração privada do backend está preservada nessa área local de backup e não foi incluída nos arquivos de entrega. Os anexos existentes não foram movidos ou substituídos.

Evidências operacionais em `D:\FROTAS\02-HOMOLOGACAO\codigo\storage\return-photos-20261020`. A configuração de build HML está separada da produção. A homologação não tem uma tarefa de inicialização automática própria identificada; após reiniciar a máquina, use `MANUTENCAO.ps1 -Action start` se necessário.

Para rollback de aplicação, interromper somente a API HML com validação de identidade, restaurar os arquivos alterados do código-base e o frontend anterior, e reiniciar pelo controle HML. A migration é aditiva: não fazer downgrade ou restauração de banco como parte de um rollback simples, pois há uma devolução de teste registrada após a atualização. A produção não participa desse procedimento.
