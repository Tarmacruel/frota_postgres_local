# Uso com Codex no VS Code

Este pacote foi estruturado para aproveitar contexto persistente do repositório em vez de repetir um briefing enorme em cada prompt.

## AGENTS.md

Mantenha `AGENTS.md` na raiz do repositório. O Codex usa arquivos de instrução `AGENTS.md` no contexto do projeto; por isso o pacote concentra ali as regras não negociáveis e aponta para o plano detalhado.

## Plan mode

Para tarefas longas, use o modo de planejamento do Codex/IDE antes de autorizar edição. O prompt `prompts/00_START_CODEX.md` já força uma Fase 0 somente de baseline, mesmo se você não usar o comando de plan mode.

## Contexto incremental

Não anexe as 25 imagens a cada turno. Elas ficam dentro do projeto e o agente deve consultar primeiro os contact sheets e apenas depois o arquivo individual da fase.

## Fontes oficiais consultadas na montagem deste pacote

- https://developers.openai.com/learn/codex
- https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- https://developers.openai.com/cookbook/examples/codex/code_modernization

O fluxo proposto segue a prática de manter instruções em `AGENTS.md`, plano executável e documentação/status de progresso para tarefas de longa duração.
