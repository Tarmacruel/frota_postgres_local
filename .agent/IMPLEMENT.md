# Runbook de implementação — evolução visual

1. Confirme a branch e o working tree antes de editar.
2. Execute o preflight da fase.
3. Leia apenas os arquivos da fase atual e suas dependências diretas.
4. Consulte o contact sheet e depois os screenshots individuais da fase.
5. Faça a menor alteração estrutural necessária.
6. Reutilize os componentes e assets do `starter-kit/` quando fizer sentido.
7. Não mude contrato de API nem regras de negócio.
8. Rode testes relevantes durante a implementação.
9. Rode `npm run test`, `npm run lint` e `npm run build` antes de concluir.
10. Faça inspeção visual em tema claro e escuro no ambiente de homologação.
11. Atualize o arquivo de status e pare. Aguarde autorização para a fase seguinte.

## Critério de parada imediata

Pare e peça decisão se:

- for necessário alterar backend ou schema;
- a rota/fluxo observado no working tree divergir do pacote;
- uma funcionalidade existente deixar de estar acessível;
- a implementação exigir trocar biblioteca/stack;
- a alteração visual causar regressão em PDF/XLSX/assinatura/permissões.
