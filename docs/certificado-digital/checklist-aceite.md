# Checklist de aceite por etapa

Preencher com data, responsável, commit e link/arquivo da evidência. Um item não marcado bloqueia a passagem do gate correspondente.

## Estado de implementação e limitações — 17/08/2026

Já existe código para migrations e persistência, PDFs canônicos do termo único e da ordem de abastecimento, seed pós-refresh de posse e ordem sintéticas, PAdES, pareamento/sessões, agente Windows e fluxo no frontend. A busca de material de revogação pela rede está desligada por padrão; os testes locais usam material controlado.

Continuam sem evidência de aceite o provisionamento administrativo do VHDX/BitLocker/ACL, o restore integral real, os serviços reais de TSA/CRL/OCSP, Authenticode, A3 físico, Windows 10/11, Adobe Reader, VALIDAR do ITI e E2E em Edge, Chrome e Firefox. Por isso, nenhum checkbox abaixo é marcado automaticamente e nenhum gate deve ser considerado concluído apenas pela implementação do código.

## Etapa 0 — Homologação segura

- [ ] Clone está em `D:\FROTAS\frota_certificado_homologacao`, branch `feature/certificado-digital-hml` e base `6e5d354` registrada.
- [ ] `.venv` e `node_modules` foram instalados no clone, sem cópia da árvore em `Z:`.
- [ ] VHDX dinâmico possui 32 GB, rótulo `FROTA-HML-SECURE`, BitLocker protegido e chave de recuperação fora de `D:`/Git.
- [ ] ACL não herda permissões amplas e permite somente usuário autorizado, `SYSTEM` e Administradores.
- [ ] Configuração, banco, storage, logs e evidências estão no volume seguro; há pelo menos 10 GB livres.
- [ ] Backend, frontend, banco e agente usam somente `127.0.0.1` nas portas 8010, 3010, 5440 e 54174.
- [ ] Nenhum processo HML escuta 80, 5432 ou 8000, escreve no storage de produção ou inicia Cloudflared/watchdog.
- [ ] Cookies, CSRF, `SECRET_KEY` e segredo de evidência são exclusivos da homologação.
- [ ] Refresh rejeita raiz não allowlisted, checksum incorreto, ZIP instável, antigo, incompleto ou com path traversal.
- [ ] `.env.backup` não é extraído e nenhuma variável de produção é ativada.
- [ ] Banco temporário recebe backup e migrations; troca e rollback de banco/storage foram ensaiados.
- [ ] Tarefas de montagem e refresh pertencem somente à conta Windows autorizada e rodam às 03:30.
- [ ] Faixa “AMBIENTE DE HOMOLOGAÇÃO” está sempre visível.

## Etapa 1 — Persistência

- [ ] Migrations aditivas sobem e descem em banco descartável.
- [ ] Assinaturas antigas são `INTERNAL_PASSWORD` sem alteração probatória.
- [ ] Artefatos, sessões, dispositivos, validações e allowlist têm constraints e índices revisados.
- [ ] Exclusão em cascade não remove assinaturas ou artefatos probatórios.
- [ ] Hook pós-refresh recria idempotentemente a posse e a ordem de abastecimento sintéticas, com as duas entradas correspondentes na allowlist, e aborta diante de colisão.
- [ ] Backend rejeita assinatura certificada de qualquer registro copiado da produção.
- [ ] `CERTIFICATE_SIGNING_ENABLED=false` permanece o padrão.

## Etapa 2 — PDF canônico

- [ ] Mesmo termo e mesma versão geram bytes e SHA-256 idênticos.
- [ ] Mesma ordem de abastecimento e mesma versão geram bytes e SHA-256 idênticos no backend.
- [ ] Não há timestamp ou conteúdo variável fora da fonte versionada.
- [ ] Mudança da fonte supersede o artefato e expira sessões antigas.
- [ ] PDF sintético exibe “HOMOLOGAÇÃO — SEM VALIDADE OPERACIONAL”.
- [ ] Download canônico exige autenticação e autorização.

## Etapa 3 — PAdES

- [ ] Assinatura válida e múltiplas revisões incrementais passam.
- [ ] Adulteração, certificado expirado/revogado/não confiável e CPF divergente falham fechados.
- [ ] Replay, sessão expirada, concorrência e duplo envio são rejeitados.
- [ ] Falha de CRL/OCSP/TSA não persiste assinatura parcial.
- [ ] `SIGNATURE_ALLOW_NETWORK_FETCHING=false` permanece o padrão e todo material local de confiança/revogação possui origem e SHA-256 registrados.
- [ ] Política AD-RT e metadados mínimos são validados.

## Etapa 4 — Agente Windows

- [ ] Executável é portátil `win-x64`, atende só `127.0.0.1:54174` e expira após 15 minutos inativo.
- [ ] A1 Store, A1 PFX/P12 em memória, RSA/ECDSA e A3 CSP/CNG passam.
- [ ] Origem indevida, token reutilizado e dispositivo revogado falham.
- [ ] Chave do dispositivo está em DPAPI e pode ser revogada.
- [ ] PFX, chave, PIN e senha não aparecem em rede, disco temporário ou logs.
- [ ] Tela de consentimento mostra ambiente, documento, tipo e hash.

## Etapa 5 — Fluxo do termo de posse

- [ ] Botões de senha e certificado são distintos e compreensíveis.
- [ ] Detecção, instalação/abertura, progresso, retomada e cancelamento do agente funcionam.
- [ ] Coassinaturas mistas contabilizam corretamente sem inserir aceite interno no PAdES.
- [ ] Somente registros sintéticos allowlisted podem chegar ao agente.
- [ ] Edge, Chrome e Firefox passam em Windows 10/11.

## Etapa 6 — Todos os documentos

- [ ] Termo único e ordem de abastecimento passam com artefatos canônicos gerados no backend.
- [ ] Empréstimo e devolução históricos elegíveis preservam bytes originais íntegros e vínculo criptográfico suficiente antes da emissão canônica.
- [ ] Snapshots históricos atuais, sem fonte elegível, recebem HTTP `409` com `HISTORICAL_CANONICAL_SOURCE_INSUFFICIENT`, sem reconstrução probatória.
- [ ] Ordem oficial gerada no backend substitui o jsPDF como fonte assinável.
- [ ] Legado continua compatível e novos termos legados não são criados.
- [ ] RBAC, readonly, pendências e supersessão passam.
- [ ] API e página pública não expõem assinatura, certificado ou PDF certificado.

## Etapa 7 — ICP-Brasil real

- [ ] Cadeia ICP-Brasil está versionada e tem processo de atualização.
- [ ] Material de confiança e revogação é provisionado de forma controlada, sem habilitar busca de rede por conveniência.
- [ ] CRL/OCSP e ACT SERPRO passam e falham de forma segura quando indisponíveis.
- [ ] Executável possui Authenticode público válido e SHA-256 publicado.
- [ ] A1 Store, A1 PFX e pelo menos um A3 físico passam em Windows 10 e 11.
- [ ] Amostras sintéticas são reconhecidas pelo Adobe Reader e VALIDAR do ITI.

## Etapa 8 — Promoção

- [ ] Suites de backend, frontend, agente, PostgreSQL, backup/restore e E2E estão verdes.
- [ ] Pacote de evidência contém PDFs sintéticos, validações, hashes, resultados e commit.
- [ ] Branch foi atualizada por merge e PR revisado não contém dados, segredos ou artefatos HML.
- [ ] Backup pré-migration e rollback foram ensaiados.
- [ ] Produção inicia com feature flag desligada e agente na porta 54173.
- [ ] Piloto ADMIN/PRODUÇÃO foi monitorado antes da expansão.
