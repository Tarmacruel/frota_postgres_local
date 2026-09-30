# Estratégia de commits e rollback

## Uma fase = um conjunto auditável

Sugestão de commits:

```text
chore(ui): prepara baseline da evolucao visual
feat(ui): adiciona tokens e componentes base
feat(ui): evolui shell global
feat(ui): evolui dashboard
feat(ui): evolui modulos operacionais centrais
feat(ui): evolui fluxos de abastecimento e ocorrencias
feat(ui): evolui telas de gestao e administracao
fix(ui): conclui qa responsivo e paridade de temas
```

## Rollback

Não criar mecanismos customizados de rollback de código. Use Git:

- commit por fase;
- working tree limpo antes da próxima fase;
- reverter o commit da fase se necessário.

Assets e CSS novos devem ser aditivos na Fase 1, reduzindo risco.

## Regra de segurança

Se uma fase exigir alteração de backend, pare. Abra uma tarefa separada com justificativa técnica; não misture backend com o redesign.
