# Runbook de homologação

## Premissas

- A iniciativa nasce da branch HML existente.
- Produção não faz parte deste plano.
- Configuração de certificado digital e agente de assinatura não deve ser alterada.

## Preflight

Na raiz do repositório:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Rode `scripts/preflight-hml.ps1` deste pacote para registrar o baseline.

## Branch sugerida

```text
feature/frontend-evolution-hml
```

Criar a partir do estado HML realmente utilizado. O script `scripts/create-evolution-branch.ps1` recusa working tree sujo por padrão.

## Validação do frontend

```powershell
cd frontend
npm run test
npm run lint
npm run build
```

## Execução

O repositório possui sua própria Central Operacional e scripts de desenvolvimento. Preserve o fluxo já utilizado no ambiente. O snapshot remoto documenta:

- desenvolvimento padrão: backend 8000 / frontend 3001;
- arquivo de exemplo de homologação: backend 8010 / frontend 3010.

Por isso, **não hardcode portas novas** em arquivos do redesign. Use a configuração do ambiente de homologação já implantado.

## Evidência por fase

Salvar ao menos:

- screenshot claro;
- screenshot escuro;
- viewport desktop;
- lista de testes executados;
- `git diff --stat`;
- `git status --short`.

Sugestão de diretório local: `docs/frontend-evolution/evidence/phase-N/`.

## Promoção

Este pacote termina na aceitação em HML. Merge/rebase/promoção para produção exige decisão posterior e revisão separada.
