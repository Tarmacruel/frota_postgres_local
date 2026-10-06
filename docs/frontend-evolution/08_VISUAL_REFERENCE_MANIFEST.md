# Manifesto de referências visuais

## Leitura eficiente

1. Abra `references/current-state/contact-sheet.jpg` para localizar a tela.
2. Abra o JPEG reduzido equivalente em `references/current-state/codex/`.
3. Só consulte o PNG original se detalhes pequenos forem necessários.
4. Para o alvo, abra `references/target/contact-sheet-target.jpg` e depois o board específico.

## Current state

Os PNGs em `references/current-state/original/` foram renomeados de acordo com a tela/função observada. Eles representam o estado visual fornecido pelo usuário e devem ser tratados como referência de funcionalidades existentes, não como especificação de código.

## Target

- `00-conceito-geral.png`: conceito inicial aprovado — linguagem visual, hierarquia e tabelas.
- `01-design-system-board.png`: tokens/componentes e miniaturas.
- `02-telas-alvo-board.png`: foco principal em dashboard e posses claro/escuro.

## Hierarquia de decisão

Quando target e current-state divergem:

- comportamento e dados: **current-state / código real**;
- organização e aparência: **target**;
- permissões e regras: **código real**;
- texto funcional: **código real**, salvo ajuste expressamente solicitado.
