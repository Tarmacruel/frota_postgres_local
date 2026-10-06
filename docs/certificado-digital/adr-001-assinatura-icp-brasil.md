# ADR-001 — Assinatura ICP-Brasil dentro do sistema

- Status: aceito para implementação incremental
- Data: 2026-08-17
- Contexto: Frota PMTF

## Contexto

O sistema possui aceite autenticado por senha. Esse mecanismo é evidência eletrônica interna, mas não representa uma assinatura digital ICP-Brasil. A nova capacidade precisa operar com e-CPF A1 e A3 no Windows, manter a chave privada sob controle do titular e produzir PDF verificável fora do sistema.

Documentos de posse evoluem após a entrega: rotas e devolução podem ser registradas depois. Assinar uma representação mutável invalidaria a relação entre consentimento e bytes apresentados ao titular. Também não é aceitável enviar PFX, PIN ou chave privada ao backend.

## Decisão técnica

- Produzir PDF canônico e determinístico no backend, persistido por conteúdo e SHA-256 antes de iniciar a assinatura.
- Usar PAdES AD-RT v1.3 com carimbo do tempo e política `2.16.76.1.7.1.12.1.3`.
- Efetuar assinatura privada em agente Windows portátil, por loopback. O backend valida certificado, identidade e cadeia, prepara os atributos e finaliza o PAdES.
- Suportar A1 no Windows Certificate Store, A1 PFX/P12 somente em memória e A3 via CSP/CNG e driver do fabricante.
- Aplicar assinaturas PAdES adicionais por revisões incrementais. Assinaturas por senha podem coexistir, mas não alteram o PDF certificado.
- Vincular sessão de cinco minutos a usuário, dispositivo, documento, versão, hash e nonce; tokens são de uso único e não trafegam em URL.
- Falhar de forma fechada quando validação da cadeia, CRL/OCSP ou TSA não estiver disponível. A busca de revogação pela rede fica desligada por padrão (`SIGNATURE_ALLOW_NETWORK_FETCHING=false`); material de confiança e revogação deve entrar por provisionamento controlado, versionado ou acompanhado de hash.
- Guardar artefatos imutáveis indefinidamente e metadados minimizados. Não guardar CPF integral, DN/SAN completos, PFX, chave, PIN ou senha.

## Decisão de produto e enquadramento

- `INTERNAL_PASSWORD` continuará identificado como aceite/evidência eletrônica interna.
- `ICP_BRASIL_PADES` será apresentado como assinatura digital ICP-Brasil somente depois da validação integral.
- O certificado deve ser e-CPF e o CPF extraído deve corresponder à conta autenticada.
- O PDF do termo de posse cobre a entrega e a ciência congeladas. Rotas e devolução posteriores permanecem fora desse escopo e não exigem reassinatura do termo já concluído.
- A ordem de abastecimento possui representação oficial determinística gerada no backend e assinável somente a partir do artefato canônico persistido.
- Termos históricos de empréstimo e devolução são elegíveis apenas se houver bytes originais íntegros e vínculo criptográfico suficiente. Os snapshots legados atuais não atendem essa condição e produzem HTTP `409`, código `HISTORICAL_CANONICAL_SOURCE_INSUFFICIENT`; o sistema não sintetiza uma nova versão para lhe atribuir valor retroativo.
- Páginas públicas não divulgarão signatários, dados de certificado nem o artefato certificado. Consulta probatória completa será interna e autenticada.
- A classificação final e os textos institucionais devem ser aprovados pela assessoria jurídica e pela autoridade competente antes do uso em produção. Este ADR não substitui parecer jurídico.

## Segurança e ambiente

- Desenvolvimento com cópia real ocorre somente no VHDX BitLocker e em loopback.
- Assinatura real na homologação é permitida apenas em registros sintéticos marcados e allowlisted pelo servidor.
- O executável de produção exigirá Authenticode público e manifesto com SHA-256; build sem assinatura válida não poderá ser promovido.
- O segredo de autenticação da homologação não será derivado nem copiado da produção, portanto cookies e sessões entre ambientes são incompatíveis.

## Estado de implementação e limitações

Estão implementados na branch de homologação o modelo persistente, artefatos canônicos do termo único e da ordem de abastecimento, motor PAdES, sessões e tokens de uso único, pareamento, agente Windows, interface de escolha do método e allowlist recriada pelo refresh para uma posse e uma ordem sintéticas. A conta, o posto e a ordem usados pelo seed possuem identificadores reservados; uma colisão aborta a transação em vez de aproveitar cadastro copiado.

Esse estado representa implementação de código e testes locais, não aceite para uso operacional. Permanecem pendentes:

- provisionar e auditar VHDX, BitLocker e ACL com privilégio administrativo;
- restaurar integralmente uma cópia real e comprovar ausência de escrita na produção;
- validar TSA, CRL e OCSP reais, inclusive a ACT SERPRO;
- assinar o executável com Authenticode público;
- testar ao menos um A3 físico, os navegadores suportados, Windows 10/11, Adobe Reader e VALIDAR do ITI.

Até a produção dessas evidências, as feature flags permanecem desligadas por padrão e nenhuma conclusão jurídica ou operacional pode ser inferida da existência do código.

## Consequências

Benefícios: documento verificável externamente, chave privada nunca no servidor, suporte a A1/A3 e trilha probatória consistente.

Custos: agente Windows adicional, dependência de cadeia/revogação/TSA, maior disciplina de versionamento de PDFs e necessidade de testes com hardware e navegadores reais.

Alternativas rejeitadas:

- Upload de PFX ao servidor: amplia risco de custódia da chave privada.
- Assinatura apenas no navegador: suporte inconsistente a Store/A3 e navegadores.
- Reclassificar aceite por senha como ICP-Brasil: tecnicamente e semanticamente incorreto.
- Assinar o termo consolidado mutável: quebra a correspondência entre consentimento e conteúdo posterior.
