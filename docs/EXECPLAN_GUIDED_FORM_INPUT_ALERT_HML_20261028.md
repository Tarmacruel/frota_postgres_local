# ExecPlan — Correção de digitação e alerta dos formulários — HML

## Objetivo
Corrigir o ícone gigante do alerta e a perda da primeira letra em digitação lenta, no componente compartilhado dos formulários, somente na homologação.

## Estado inicial verificado
- Branch fix/guided-form-input-alert-hml-20261028 a partir de dd35083; working tree limpo.
- Baseline anterior: 643 testes/87 arquivos, lint zero erros/39 avisos anteriores, build HML aprovado.
- Produção 0cd053c preservada; frontend HML index-B2K1JZAJ.js, API6969/PID21432.
- Reproduzidos no Chromium: teclas isoladas a/b no campo vazio não permanecem; ícone sem classe mede546px no alerta.
- AppIcon exige className explícito. A leitura de progresso agendada por microtask durante capture pode renderizar o valor controlado anterior antes do onChange.

## Arquivos previstos
GuidedForm.jsx, seus testes, guided-forms.css se necessário, este ExecPlan e STATUS.md.

## Alterações funcionais proibidas
Sem backend/schema/dados/configurações/API/payloads/permissões/regras financeiras. Sem reinício, produção ou gravações de negócio na QA.

## Passos de implementação
- [x] Reproduzir no navegador sem tocar no rascunho do usuário.
- [x] Regressão para o intervalo capture→change, correção de agendamento e tamanho dos ícones compartilhados.
- [ ] Testes, lint e build homologation.
- [ ] Backup/reversão, publicação somente de frontend HML e QA real de digitação isolada, alerta, temas e mobile.
- [ ] Registrar resultado, integridade e evidências.

## Validação visual
Digitar uma tecla por vez desde o campo vazio, com observação entre teclas; apagar/recomeçar, editar outros campos e manter posição do cursor. Conferir erro local, feedback de servidor e ícone de etapa concluída. Desktop/mobile claro/escuro, teclado e retorno de foco. Não enviar o formulário.

## Testes e build
Teste de regressão com fronteira entre captura nativa e mudança React, preservação de valores e seletores. Suíte frontend completa, lint e build HML conforme AGENTS.md.

## Resultado
Correção implementada. Os dois novos casos falharam na base anterior: caractere A desaparecia antes de change, e SVG do alerta não tinha a classe de tamanho. Após a mudança, os 16 testes do componente passaram. A inspeção de progresso usa um único requestAnimationFrame após a propagação do evento, com leitura atualizada e cancelamento ao desmontar. O próprio campo continua atualizando imediatamente no onChange.

Os três usos de AppIcon no componente agora recebem app-icon: alerta local, feedback de servidor e marco de etapa concluída. Dimensões existentes de18px/12px preservadas. Nenhuma alteração no componente global de ícones ou nos handlers/payloads dos formulários. Lint zero erros/39 avisos anteriores; build HML candidato index-CexbYAw6.js aprovado. Suíte completa e publicação em andamento.

Backup/reversão próprios em storage/backups/20261028-guided-form-input-alert; a referência do banco é somente leitura e não sobrescreve a referência da entrega anterior. Publicador confere produção/configurações/backend preservados e exige645 testes aprovados antes de trocar os assets/index HML.

## Pendências / decisões
Preservar a digitação, sem atrasos artificiais na atualização do próprio campo; adiar apenas a inspeção de progresso até o evento terminar.

## Rollback
Conservar dist anterior antes de publicar; copiar assets antes da troca atômica do index. Reverter somente frontend, sem restaurar banco ou alterar APIs.
