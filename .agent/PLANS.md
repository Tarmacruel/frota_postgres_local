# ExecPlans do Frota PMTF

Um ExecPlan é o documento operacional da fase em execução. Deve permitir que outro agente continue o trabalho sem depender da conversa anterior.

## Quando criar/atualizar

Crie ou atualize um ExecPlan antes de qualquer fase que altere mais de uma tela, o shell global ou componentes reutilizáveis.

## Estrutura obrigatória

```md
# ExecPlan — Fase N — <nome>

## Objetivo
## Estado inicial verificado
- branch
- HEAD
- git status
- baseline de test/lint/build

## Arquivos previstos
## Alterações funcionais proibidas
## Passos de implementação
## Validação visual
## Testes e build
## Resultado
## Pendências / decisões
## Rollback
```

## Regra de continuidade

O plano é vivo: marque o que foi executado e registre desvios. Não apague decisões anteriores; acrescente correções com data e motivo.
