# ADR 003 — Identidade institucional e assinatura do termo único

- **Status:** aprovado e implementado
- **Data:** 2026-07-13
- **Escopo:** termo único de posse e responsabilidade
- **Substitui parcialmente:** ADR 002, apenas quanto à ausência de nova assinatura no fluxo do termo único

## Contexto

O termo único implantado na Fase 5 passou a ser gerado no backend, porém o primeiro
modelo perdeu o brasão, a linha de assinatura e parte da identidade institucional que
existiam nos documentos anteriores. A assinatura dos tipos legados
`POSSESSION_LOAN_TERM` e `POSSESSION_RETURN_TERM` não pode ser reutilizada no termo
consolidado: seus snapshots não abrangem o mesmo conteúdo e seus endpoints públicos
permanecem restritos ao legado.

O termo consolidado também evolui com rotas, destinos e devolução. Exigir uma nova
assinatura a cada rota contrariaria a decisão de termo único e criaria uma obrigação
operacional sem benefício de integridade.

## Decisões

1. O brasão, a Prefeitura, a Secretaria Municipal de Administração, o Setor de Frotas,
   o CNPJ e o endereço institucional compõem o cabeçalho/rodapé dos
   documentos oficiais de posse gerados pelo backend.
2. O texto visível usa linguagem administrativa final. UUID, IP, user-agent, request ID,
   caminhos internos e observações sobre backend, persistência ou controles técnicos não
   integram o corpo do documento.
3. Datas permanecem armazenadas em UTC e são apresentadas no fuso institucional
   `America/Bahia`.
4. O termo possui campo para assinatura física da pessoa responsável pela condução e do
   responsável pela entrega.
5. A assinatura eletrônica do fluxo novo usa o tipo autenticado e não público
   `POSSESSION_RESPONSIBILITY_TERM`. Ela registra a declaração do agente público que
   realizou ou conferiu administrativamente a entrega; não é apresentada como prova de
   assinatura eletrônica do motorista. O texto e a versão canônicos integram o snapshot
   e o código de integridade.
6. Rotas, destinos e devolução são eventos posteriores e não alteram o escopo assinado
   da entrega; portanto, não exigem nova assinatura. Retificação administrativa dos dados
   da entrega substitui o documento eletrônico ativo, preservando o anterior.
7. A devolução continua sendo uma declaração autenticada, append-only e versionada. Ela
   não é denominada assinatura digital, qualificada ou ICP-Brasil.
8. Assinaturas e endpoints públicos dos tipos `POSSESSION_LOAN_TERM` e
   `POSSESSION_RETURN_TERM` permanecem somente para registros legados, inclusive com a
   nomenclatura histórica original.
9. O termo único novo não possui endpoint público de verificação. Preview, download,
   emissão e assinatura exigem autenticação e seguem RBAC, CSRF, auditoria e `no-store`.

## Texto canônico da ciência eletrônica

- **Versão:** 1.0
- **Escopo:** `DELIVERY_AND_RESPONSIBILITY_ACCEPTANCE`

> Declaro, na condição de agente responsável pelo registro da entrega, que conferi os
> dados de identificação e responsabilidade constantes neste termo e que o veículo foi
> disponibilizado à pessoa responsável pela condução para uso exclusivo no serviço
> público, ficando registrados os deveres de guarda, conservação, observância da
> legislação de trânsito e comunicação de ocorrências.

## Consequências

- O modelo não depende do estado do navegador para gerar o PDF oficial.
- A assinatura eletrônica não é confundida com a confirmação de devolução nem com as
  assinaturas históricas dos termos separados.
- Alterações no texto, versão ou escopo canônicos exigem nova versão; registros já
  assinados não são reescritos.
- O asset institucional é obrigatório: a emissão falha de forma explícita se o brasão
  rastreado não estiver disponível, em vez de produzir documento sem identidade.
- A distribuição `tzdata` é dependência fixada do backend para garantir a apresentação
  consistente de `America/Bahia` também em instalações Windows.
- Os PDFs usam a família Roboto distribuída pelo pacote fixado `font-roboto==0.0.1`,
  com as fontes incorporadas ao arquivo. O pacote e as fontes estão sob Apache-2.0;
  o artefato sdist validado possui SHA-256
  `8bc9136bf46609fbb13af4783016799b14e23dda294a61791171de7ea2ec457f`.
