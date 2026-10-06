# AGENTS.md — Frota PMTF / evolução de frontend

## Escopo desta iniciativa

Existe uma iniciativa de evolução visual do frontend documentada em `docs/frontend-evolution/`. Antes de alterar qualquer tela relacionada a essa iniciativa, leia:

1. `docs/frontend-evolution/00_MASTER_PLAN.md`
2. `docs/frontend-evolution/01_REPO_CONTEXT.md`
3. `docs/frontend-evolution/02_VISUAL_SPEC.md`
4. `.agent/IMPLEMENT.md`
5. o arquivo de status da execução, se já existir.

Para mudanças extensas ou refactors visuais, use um ExecPlan conforme `.agent/PLANS.md`.

## Regras não negociáveis

- Implementar inicialmente **somente em homologação/testes**.
- Não publicar em produção e não alterar arquivos de deploy de produção sem ordem expressa.
- Não alterar backend, modelos, migrations, banco, endpoints, payloads, autenticação, autorização ou regras de negócio apenas para atender ao redesign.
- Preservar rotas, nomenclaturas funcionais e permissões existentes.
- Preservar emissão de PDF/XLSX, assinatura digital, busca global, auditoria e fluxos de posse/abastecimento.
- Não remover funcionalidades existentes por parecerem visualmente redundantes.
- Não reconstruir páginas inteiras quando uma alteração incremental de layout/componente resolver.
- Tema claro e escuro devem permanecer funcionais e equivalentes.
- Usar os screenshots atuais como evidência funcional e os boards de `references/target/` como direção visual.
- Uma discrepância entre screenshot e branch deve ser investigada no working tree local antes de qualquer decisão.
- Executar **uma fase por vez**. Não avançar para a fase seguinte sem validação e autorização.

## Política de diffs

- Preferir componentes reutilizáveis e CSS centralizado.
- Evitar estilos inline novos, salvo valor calculado realmente dinâmico.
- Não duplicar tokens de cor/espaçamento em várias páginas.
- Manter alterações por fase pequenas e auditáveis.
- Ao concluir cada fase, registrar arquivos alterados, testes executados, pendências e screenshots de validação.

## Quality gates mínimos

No diretório `frontend`:

```powershell
npm run test
npm run lint
npm run build
```

Se um comando falhar por problema preexistente, documentar o baseline antes da mudança e provar que a fase não piorou o estado.

## Eficiência de contexto

- Comece pelos contact sheets; abra PNG individual apenas da tela em trabalho.
- Não releia `styles.css` inteiro repetidamente. Localize os seletores envolvidos.
- Não abra páginas que não pertencem à fase atual.
- Reutilize os arquivos prontos de `starter-kit/` quando compatíveis com o working tree.
- Atualize o status ao final de cada fase para não reconstruir contexto nas próximas sessões.
