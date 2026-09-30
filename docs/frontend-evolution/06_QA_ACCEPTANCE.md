# Critérios de QA e aceite

## Funcional

- [ ] Todas as rotas acessíveis antes continuam acessíveis com as mesmas permissões.
- [ ] Busca global continua funcionando.
- [ ] Alternância claro/escuro persiste no `localStorage` existente.
- [ ] PDF/XLSX continuam disponíveis nas telas onde já existiam.
- [ ] Fluxos de assinatura digital não foram alterados.
- [ ] Modal, paginação, filtros, seleção e ações CRUD continuam funcionando.
- [ ] Nenhuma chamada API adicional em loop foi introduzida pelo frontend visual.

## Visual

- [ ] Cabeçalhos de página seguem o mesmo padrão.
- [ ] Botão primário é identificável sem competir com ações secundárias.
- [ ] Tabelas longas têm leitura horizontal clara.
- [ ] Ações secundárias repetitivas foram agrupadas quando seguro.
- [ ] Status têm cor e rótulo consistentes.
- [ ] Miniaturas de veículo não deformam linhas.
- [ ] Tema escuro não tem texto preto em surface escura nem bordas invisíveis.
- [ ] Tema claro não usa grandes áreas azuladas sem função.

## Responsividade

Testar pelo menos:

- 1920×1080
- 1600×900
- 1366×768
- 1024×768
- 768×1024

Em telas pequenas, é aceitável scroll horizontal controlado na tabela quando a alternativa seria ocultar informação crítica.

## Acessibilidade mínima

- [ ] foco por teclado visível;
- [ ] botões só com ícone têm `aria-label`;
- [ ] menu overflow opera com teclado;
- [ ] contraste de texto/status adequado;
- [ ] não depender apenas de cor para estado crítico;
- [ ] modais mantêm foco e fecham por Escape quando já era o padrão.

## Quality gates

```powershell
npm run test
npm run lint
npm run build
```
