# Responsividade e acessibilidade

## Desktop

O sistema é operacional e predominantemente desktop. Em 1366 px, priorizar densidade:

- sidebar compacta opcional;
- filtros podem ocupar duas linhas;
- tabela usa scroll horizontal se necessário;
- ações de linha migram para overflow em vez de comprimir texto.

## Tablet

- sidebar vira drawer existente;
- topbar mantém busca acessível;
- filtros empilham em grid de 2 colunas/1 coluna;
- cards KPIs podem usar 2 colunas.

## Móvel

Não transformar tabelas críticas em cards incompletos automaticamente. Se o fluxo atual já possui navegação móvel, preservar e testar. Para tabelas densas, wrapper com scroll horizontal é preferível a ocultar colunas essenciais.

## Keyboard

- foco visível em todos os controles;
- `ActionMenu`: Enter/Espaço abre, Escape fecha;
- tab order segue leitura visual;
- botão só ícone sempre tem `aria-label`.

## Motion

Transições 120–180 ms. Respeitar `prefers-reduced-motion` para transformações não essenciais.
