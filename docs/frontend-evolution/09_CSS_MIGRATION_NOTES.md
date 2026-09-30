# Notas para evolução do CSS

## Estado atual

`frontend/src/styles.css` já contém:

- tokens `:root` e `:root[data-theme='dark']`;
- shell, sidebar e topbar;
- cards e métricas;
- tabelas e chips;
- regras responsivas;
- um bloco extenso `body.internal-app-active` para densidade desktop;
- estilos específicos de importação e pagamentos.

O arquivo grande torna perigoso “reescrever CSS”.

## Estratégia recomendada

### Fase 1

Adicionar `frontend/src/styles/frontend-evolution.css` **depois** do CSS atual. Usar novos tokens semânticos e apenas overrides deliberados.

Em `main.jsx`, depois de `./styles.css`:

```js
import './styles/frontend-evolution.css'
```

Não apagar o CSS antigo nesta fase.

### Fases seguintes

À medida que páginas migrarem para componentes novos:

- remover estilos inline substituídos;
- mover regras duplicadas para a folha nova;
- não limpar seletores antigos até confirmar que não são usados por outras telas;
- usar busca por classe antes de excluir qualquer regra.

## Evitar

- `!important` em massa;
- valores de cor repetidos em dezenas de seletores;
- seletores dependentes de posição DOM frágil;
- trocar a folha inteira de uma vez;
- quebrar dark mode com cor fixa.
