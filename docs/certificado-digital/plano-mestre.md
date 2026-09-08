# Plano mestre — assinatura digital ICP-Brasil

## Objetivo

Adicionar assinatura de documentos com certificado ICP-Brasil e-CPF, no padrão PAdES AD-RT, preservando o aceite por senha como evidência eletrônica interna alternativa. O desenvolvimento e a validação ocorrerão primeiro em uma homologação local isolada; nenhum dado, segredo ou artefato de homologação será promovido à produção.

## Topologia imutável da homologação

| Componente | Valor |
|---|---|
| Repositório | `D:\FROTAS\frota_certificado_homologacao` |
| Branch | `feature/certificado-digital-hml` |
| Base inicial | `6e5d354` |
| Frontend | `http://127.0.0.1:3010` |
| Backend | `http://127.0.0.1:8010` |
| PostgreSQL | `127.0.0.1:5440/frota_hml` |
| Agente assinador | `127.0.0.1:54174` |
| VHDX | `D:\FROTAS\.secure\frota-certificado-hml-data.vhdx` |
| Ponto de montagem | `D:\FROTAS\frota_certificado_homologacao\.runtime-secure` |
| Atualização | diariamente às 03:30 |

As portas `80`, `5432` e `8000` são reservadas ao ambiente atual e nunca poderão ser usadas pela homologação. O frontend, o backend, o banco e o agente aceitarão somente loopback.

## Controles invariantes

- Banco, anexos, configuração, logs e evidências ficam no VHDX dinâmico de 32 GB, protegido por BitLocker e ACL restrita ao usuário autorizado, `SYSTEM` e Administradores.
- A chave de recuperação fica fora de `D:` e fora do Git. A cópia usada na automação é protegida por DPAPI para o usuário Windows que instalou as tarefas.
- Configuração, cookies, CSRF, `SECRET_KEY` e segredo de evidência são exclusivos da homologação. O `.env.backup` de produção nunca é extraído.
- O refresh é unidirecional, aceita somente raízes allowlisted e backups com SHA-256 lateral válido, restaura em banco temporário e conserva apenas o snapshot anterior.
- Apenas registros sintéticos explicitamente allowlisted poderão receber assinatura real. O bloqueio será imposto pelo backend e os PDFs terão a marca “HOMOLOGAÇÃO — SEM VALIDADE OPERACIONAL”.
- Artefatos assinados são imutáveis. PII integral de certificado, chave privada, PFX, PIN e senha nunca serão registrados em log.
- A indisponibilidade de cadeia, revogação ou carimbo do tempo bloqueia a assinatura ICP-Brasil; o fluxo por senha permanece uma escolha explícita.

## Estado de implementação e limitações — 17/08/2026

Código disponível na branch de homologação:

- persistência aditiva para artefatos, sessões, dispositivos, validações e allowlist, mantendo `INTERNAL_PASSWORD` separado de `ICP_BRASIL_PADES`;
- PDF canônico determinístico do termo único de responsabilidade e geração oficial da ordem de abastecimento no backend; os snapshots históricos atuais não preservam fonte imutável suficiente e, por isso, não geram artefato canônico;
- hook pós-refresh que recria uma posse e uma ordem de abastecimento sintéticas, com seus dois registros em `homologation_signing_targets`; colisões com identificadores reservados abortam a transação;
- motor PAdES, contratos de sessão, pareamento, agente Windows e fluxo de interface implementados para ensaio controlado;
- trust store e validação configurados para material controlado. A busca de revogação pela rede permanece desligada por padrão com `SIGNATURE_ALLOW_NETWORK_FETCHING=false`; CRLs, respostas e certificados de teste devem ser provisionados de forma explícita e rastreável;
- bloqueio no backend para impedir assinatura certificada fora da allowlist sintética e marca de homologação nos PDFs gerados pelo sistema.

Limitações e gates ainda não executados:

- provisionamento efetivo do VHDX, BitLocker, ACL e tarefas elevadas depende de execução administrativa no Windows;
- a restauração integral de um backup real, a troca atômica e o rollback completo ainda precisam ser ensaiados no volume seguro;
- TSA, CRL e OCSP reais, inclusive ACT SERPRO, ainda não foram integrados e validados de ponta a ponta;
- o executável ainda não possui assinatura Authenticode pública;
- faltam ensaios com A3 físico, Windows 10/11, Adobe Reader, VALIDAR do ITI e E2E em Edge, Chrome e Firefox.

Código presente e testes automatizados locais não equivalem à aprovação de um gate. Os itens correspondentes permanecem pendentes no checklist até haver evidência operacional anexada.

## Entregas incrementais e gates

### Etapa 0 — Ambiente e documentação

Clone e branch independentes, VHDX/BitLocker, configuração exclusiva, launchers seguros, atualização diária, faixa permanente de homologação e este conjunto documental.

Gate: serviços nas quatro portas homologadas, restauração integral validada, nenhuma escrita em produção e nenhum segredo fora do volume protegido.

### Etapa 1 — Contratos e persistência

Criar, de forma aditiva, artefatos digitais, sessões, dispositivos pareados, validações e allowlist sintética. Classificar assinaturas atuais como `INTERNAL_PASSWORD`, impedir cascade destrutivo e manter `CERTIFICATE_SIGNING_ENABLED=false`.

Gate: migrations reversíveis em banco descartável, legado e APIs atuais compatíveis.

### Etapa 2 — PDF canônico do termo de posse

Congelar no backend os bytes determinísticos do termo único, com versão e SHA-256. Alteração da fonte supersede o artefato anterior.

Gate: fontes iguais produzem hash igual; versões obsoletas não podem ser assinadas.

### Etapa 3 — Motor PAdES

Integrar `pyHanko[async-http]==0.36.2`, assinatura interrompida, sessões de cinco minutos, validação de e-CPF/CPF/cadeia/revogação e PAdES AD-RT v1.3 com TSA local de teste. Política: `2.16.76.1.7.1.12.1.3`.

Gate: testes positivos e negativos de validade, adulteração, identidade, replay, concorrência e coassinatura.

### Etapa 4 — Agente Windows

Criar `FrotaSigner-HML.exe` em .NET 10/WPF, portátil `win-x64`, loopback, encerramento por inatividade e suporte a A1 Store/PFX e A3 CSP/CNG. Pareamento por código, chave do dispositivo em DPAPI e consentimento mostrando documento e hash.

Gate: Store/PFX, RSA/ECDSA, origem, replay, revogação do dispositivo e ausência de segredos em log.

### Etapa 5 — Fluxo completo do termo de posse

Oferecer separadamente assinatura por senha e ICP-Brasil, detectar o agente, permitir retomada segura e apresentar metadados minimizados. Coassinaturas mistas contam para o workflow; a assinatura interna não modifica o PDF PAdES.

Gate: E2E em Edge, Chrome e Firefox com casos de falha e somente alvos sintéticos.

### Etapa 6 — Todos os documentos

A ordem de abastecimento já possui geração oficial determinística no backend. Termos históricos de empréstimo e devolução só poderão ser congelados se o registro preservar fonte elegível, com bytes originais íntegros e vínculo criptográfico suficiente. Os snapshots legados atuais não satisfazem esse requisito: o backend responde HTTP `409` com o código `HISTORICAL_CANONICAL_SOURCE_INSUFFICIENT`, sem reconstruir ou reclassificar o documento. Páginas públicas continuam sem dados de signatários, evidências ou PDF certificado.

Gate: regressão dos quatro tipos, RBAC, readonly, supersessão e legado.

### Etapa 7 — ICP-Brasil real

O carregamento controlado da cadeia confiável está implementado com busca de rede desabilitada por padrão. Permanecem pendentes a integração e a validação reais de CRL/OCSP e ACT SERPRO, a aplicação de Authenticode público e a validação exclusiva de documentos sintéticos no Adobe Reader e no VALIDAR do ITI.

Gate: A1 Store, A1 PFX e A3 físico em Windows 10/11, com falha segura de dependências externas.

### Etapa 8 — Aceite e promoção

Executar regressão completa e produzir pacote de evidências por commit. Atualizar a branch por merge; promover apenas código e migrations por PR revisado. Produção recebe primeiro a feature flag desligada e piloto restrito.

Gate: checklist integral aprovado, backup pré-migration e plano de rollback ensaiado.

## Interfaces implementadas para homologação

- `POST /documents/{id}/certificate-sessions`
- `GET|DELETE /certificate-sessions/{id}`
- `GET /documents/{id}/artifacts/{canonical|certified}`
- `GET /documents/{id}/validation`

Estados de sessão: `CREATED`, `CERTIFICATE_VALIDATED`, `AWAITING_SIGNATURE`, `FINALIZING`, `COMPLETED`, `FAILED`, `CANCELLED` e `EXPIRED`.

Métodos de assinatura: `INTERNAL_PASSWORD` e `ICP_BRASIL_PADES`.

## Referências

- [Assinatura Digital com Referência de Tempo — ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-de-tempo-ad-rt)
- [VALIDAR — ITI](https://www.gov.br/pt-br/servicos/verificador-de-conformidade-de-assinaturas-digitais-icp-brasil)
- [API Timestamp — SERPRO](https://doc-apitimestamp.estaleiro.serpro.gov.br/)
