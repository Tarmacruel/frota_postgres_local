# Fase 06 — regularização de empréstimos anteriores

Entregue em 29/09/2026 exclusivamente em `D:\FROTAS\frota_emprestimos_testes`, branch `feature/emprestimos-secretarias`.

## Acesso e uso

Acesse [Empréstimos no ambiente de testes](https://testefrota.sirel.com.br/emprestimos) ou `http://localhost:6969/emprestimos`, com uma conta administradora. O botão **Regularizar empréstimo anterior** exige perfil ADMIN e permissão de criação no módulo.

1. Selecione veículo, secretaria proprietária e lotação original, secretaria recebedora e lotação de destino.
2. Informe data/hora efetiva da entrega, odômetro, condições, motivo, referência documental e justificativa administrativa.
3. Para empréstimo ainda em andamento, deixe a opção de devolução desmarcada; a previsão de devolução é opcional.
4. Para empréstimo já encerrado, marque **Este empréstimo já foi devolvido** e informe data/hora, lotação de retorno, odômetro e condições da devolução.
5. Clique em **Conferir prévia da regularização**. Confira impedimentos, avisos, eventual correção de origem/mudança de lotação e contagens dos módulos envolvidos.
6. Resolva os impedimentos, confirme a revisão e salve. Alterar qualquer campo invalida a prévia. Se os registros envolvidos mudarem antes da confirmação, o sistema exige nova conferência.

As datas são informadas no horário local do navegador e enviadas com fuso horário. Odômetro zero é válido; justificativa e referência documental são obrigatórias.

## Efeitos e limites

- Empréstimos já devolvidos entram como `RETURNED`; a lotação atual permanece intacta, inclusive quando existe outro empréstimo atual.
- Empréstimos ainda em andamento entram como `ACTIVE`. Quando necessária, a mudança da lotação ocorre no momento da regularização; o histórico anterior de lotação é preservado. A data efetiva informada fica no empréstimo.
- Posses, abastecimentos, ordens, manutenções, sinistros e multas antigos não têm secretaria, empréstimo ou custos reatribuídos. A prévia distingue registros sem responsabilidade e registros atribuídos a outra secretaria. As regras existentes de consulta compartilhada passam a considerar o empréstimo regularizado.
- Períodos efetivos sobrepostos são recusados. Períodos adjacentes são permitidos. Empréstimo em andamento também é bloqueado por proposta enviada ou outro empréstimo atual, posses/rotas abertas e ordens pendentes.
- Posses e rotas que atravessam as datas informadas, datas efetivas futuras e inconsistências entre os odômetros informados e registros operacionais precisam ser resolvidas antes da confirmação.
- Origem diferente ou não identificada exige confirmação explícita para corrigir o cadastro. Essa correção só é permitida quando o veículo ainda não tem empréstimos ou propostas, e fica auditada com o valor anterior.
- Não são fabricados aceites, representantes, assinaturas ou termos históricos. O registro recebe a identificação **Inclusão retroativa**, referência documental e evento imutável `REGULARIZED`, com usuário, secretaria representada, justificativa, data da inclusão e data efetiva informada.
- Um empréstimo regularizado em andamento pode ser devolvido pelo fluxo normal. O termo dessa devolução atual mantém os dois representantes/assinaturas e identifica a regularização administrativa anterior.
- Esta fase não inclui retificação arbitrária de empréstimos existentes, migração em lote nem reatribuição automática de registros antigos.

## Implementação

Migration aditiva `0047_loan_regularization`, posterior a `0046_loan_terms`: campos opcionais `regularized_at` e `regularization_reference` e proteção de sobreposição de períodos efetivos no PostgreSQL. Nenhum registro antigo é atualizado pela migration. O downgrade recusa a remoção se houver regularizações, preservando a evidência administrativa.

Endpoints restritos a administradores:

| Método | Endereço | Função |
|---|---|---|
| GET | `/api/vehicle-loans/regularization/catalog` | Veículos e lotações para a regularização |
| POST | `/api/vehicle-loans/regularization/preview` | Validação e prévia sem gravação do empréstimo |
| POST | `/api/vehicle-loans/regularization` | Confirmação com token da prévia |

O token HMAC vincula dados informados, usuário e estado relevante consultado. A confirmação revalida tudo sob bloqueio do veículo, com transação única para empréstimo, eventual origem/lotação e auditoria. Repetição, concorrência ou mudança do estado retorna conflito e exige nova prévia.

## Verificação

- **433 testes backend aprovados**, com **19 skips condicionais** de outras integrações; inclui 10 cenários da regularização em PostgreSQL descartável. A migration foi testada nesses bancos antes de ser aplicada à cópia de trabalho.
- **156 testes frontend aprovados**, em 33 arquivos; inclui seis cenários do formulário e visibilidade exclusiva para administradores.
- Build do frontend e lint dos componentes alterados concluídos.
- Cenários cobertos: devolvido/em andamento, prazo indeterminado, zero, datas inválidas, origem desconhecida, correção explícita, permissões, sobreposição e períodos adjacentes, posses/rotas/ordens pendentes, odômetros, alterações após a prévia e confirmação simultânea.
- Termo de devolução de empréstimo regularizado gerado com dados sintéticos e conferido visualmente nas duas páginas. Teste específico repetido e aprovado após inclusão da evidência visual.
- Login, catálogo, prévia e consultas operacionais com HTTP 200 em localhost e no túnel. Formulário conferido no navegador. A verificação não confirmou empréstimos: contagem de regularizações na base de trabalho permaneceu igual.
- Produção respondeu HTTP 200; repositório de produção permaneceu limpo no commit `12150b19919b999cd47668abe4c3e6b5f3504329`. Nenhuma publicação ou migration desta fase foi executada em produção.

Evidências locais ignoradas pelo Git: `storage/loan-tests/phase6-smoke.json`, `phase6-backend-tests.log`, `phase6-frontend-tests.log`, `phase6-build.log`, PDFs em `storage/loan-tests/pdf-qa` e captura `output/playwright/phase6-regularization.png`.

## Operação e próxima fase

Na pasta de testes, os comandos existentes continuam disponíveis:

```powershell
powershell -NoProfile -File scripts/loan-tests.ps1 status
powershell -NoProfile -File scripts/loan-tests.ps1 start
powershell -NoProfile -File scripts/loan-tests.ps1 stop
```

O comando de parada encerra API e PostgreSQL desta cópia. O ambiente permanece isolado nas portas 6969/5441, com armazenamento próprio e integrações externas de assinatura desabilitadas.

Fase 06 concluída em testes. A fase 07, de validação integrada e preparação/publicação em produção, permanece pendente de uma próxima etapa.
