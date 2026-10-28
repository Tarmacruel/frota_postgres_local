import { getApiErrorMessage } from './apiError'
import { getApiErrorCode, getHttpStatus } from './httpError'

const fields = {
  vehicle_id: ['Veículo', 'destination'], origin_allocation_id: ['Lotação de origem', 'destination'],
  destination_allocation_id: ['Lotação de destino', 'destination'], acting_organization_id: ['Secretaria representada', 'destination'],
  return_allocation_id: ['Lotação de retorno', 'period'], reason: ['Motivo do empréstimo', 'review'],
  justification: ['Justificativa', 'review'], document_reference: ['Referência documental', 'review'],
  started_at: ['Entrega efetiva', 'period'], returned_at: ['Devolução efetiva', 'period'], expected_return_at: ['Previsão de devolução', 'period'],
  delivery_odometer_km: ['Odômetro de entrega', 'delivery'], return_odometer_km: ['Odômetro de devolução', 'delivery'],
  delivery_condition: ['Condições de entrega', 'delivery'], return_condition: ['Condições de devolução', 'delivery'],
}

export function loanFeedback(error, fallback, readOnly = false) {
  const message = typeof error === 'string' ? error : getApiErrorMessage(error, fallback)
  const code = getApiErrorCode(error)
  const status = getHttpStatus(error)
  const detail = error?.response?.data?.detail
  const invalidFields = Array.isArray(detail) ? detail.filter((item) => Array.isArray(item?.loc) && fields[item.loc.at(-1)]) : []
  if (status === 422 && invalidFields.length) {
    const hints = invalidFields.map((item) => {
      const [label] = fields[item.loc.at(-1)]
      const type = item.type || ''
      const hint = type === 'missing' ? 'preencha este campo' : type === 'string_too_short' ? `informe pelo menos ${item.ctx?.min_length ?? 'o mínimo de'} caracteres`
        : type === 'string_too_long' ? `use no máximo ${item.ctx?.max_length ?? 'o limite de'} caracteres` : /decimal|float|int|greater_than|less_than/.test(type) ? 'confira o número e o limite indicados no campo'
          : /date|time/.test(type) ? 'confira a data e a hora informadas' : 'revise o valor ou selecione uma opção válida na lista'
      return `${label}: ${hint}.`
    })
    return { title: 'Revise os campos informados', message: hints.join(' ') + (message.match(/\s\(referência:[^)]+\)$/)?.[0] || ''),
      guidance: 'Volte à etapa indicada, corrija os campos e confira novamente antes de salvar.', target: fields[invalidFields[0].loc.at(-1)][1], technicalMessage: message }
  }
  const text = message.toLocaleLowerCase('pt-BR')
  let title = 'Não foi possível concluir'
  let guidance = 'Confira a mensagem e os dados informados. Se o problema persistir, informe a referência ao suporte.'
  let target = 'review'
  if (status === 401) { title = 'Sua sessão expirou'; guidance = 'Entre novamente na homologação e retorne a este empréstimo. Não informe sua senha ao suporte.'; target = 'session' }
  else if (status === 403) { title = 'Esta ação exige outra representação'; guidance = 'Confira a secretaria responsável e peça a um usuário autorizado dessa secretaria para realizar a ação.'; target = 'permission' }
  else if (code === 'LOAN_DISTINCT_ACCEPTOR_REQUIRED' || /outro usu[aá]rio/.test(text)) { title = 'A confirmação precisa de outra pessoa'; guidance = 'Peça a outro usuário autorizado da secretaria responsável para abrir este empréstimo e confirmar o recebimento. Quem enviou não pode confirmar.'; target = 'permission' }
  else if (status === 404) { title = 'O registro não foi encontrado'; guidance = 'Atualize a consulta e confira o registro ou anexo selecionado. Se ele estava disponível antes, peça à gestão ou ao suporte para conferir sua disponibilidade.'; target = 'refresh' }
  else if (code === 'LOAN_PENDING_OPERATIONS' || /pend[eê]ncias abertas|poss(es|e).*rotas|ordens.*abertas/.test(text)) { title = 'Há operações abertas no veículo'; guidance = 'Consulte posses, rotas e ordens abertas, conclua ou corrija os registros aplicáveis e atualize a conferência. As rotas ficam no menu da posse correspondente; nada é encerrado automaticamente.'; target = 'operations' }
  else if (['LOAN_VERSION_CONFLICT', 'LOAN_CONFLICT', 'LOAN_INVALID_STATE', 'REGULARIZATION_REVIEW_CHANGED'].includes(code) || /mudou|alterad[ao]|nova pr[eé]via|atualize.*dados|atualize.*pend[eê]ncias/.test(text)) { title = 'É preciso conferir a versão atual'; guidance = 'Atualize a consulta e confira a situação antes de tentar novamente. Na regularização, gere uma nova prévia dos efeitos.'; target = 'refresh' }
  else if (/sobrep[oõ]e|sobrepostos|atravessa|em andamento|proposta enviada/.test(text)) { title = 'O período precisa de conferência'; guidance = 'Compare as datas efetivas com o histórico do veículo e os empréstimos existentes. Corrija somente informações que não correspondam ao ocorrido.'; target = 'period' }
  else if (/od[oô]metro/.test(text) || code === 'LOAN_ODOMETER_REVIEW') { title = 'Confira o odômetro'; guidance = `${detail?.minimum_odometer_km != null ? `Referência mínima retornada: ${detail.minimum_odometer_km} km. ` : ''}Compare a leitura do veículo com os registros do período e revise o campo correspondente antes de tentar novamente.`; target = 'delivery' }
  else if (/lota[cç][aã]o|origem|propriet[aá]ri/.test(text)) { title = 'Confira origem e lotação'; guidance = 'Revise a secretaria e a lotação selecionadas. Se o cadastro não corresponder à situação real, confira o veículo com a gestão antes de continuar.'; target = 'destination' }
  else if (/data|prazo|previs[aã]o|per[ií]odo/.test(text)) { title = 'Confira as datas informadas'; guidance = 'Use a data e a hora efetivas para entrega e devolução; o prazo previsto é somente uma previsão. Revise o período sem alterar o histórico para contornar o bloqueio.'; target = 'period' }
  else if (/justificativa|representa[cç][aã]o/.test(text)) { title = 'Informe a justificativa'; guidance = 'Explique o motivo da ação no campo de justificativa e confira a secretaria que você representa.'; target = 'review' }
  else if (/senha/.test(text)) { title = 'Confira sua senha na tela de assinatura'; guidance = 'Digite sua senha atual no próprio formulário e confira o termo antes de confirmar. Se precisar redefini-la, use a opção de senha da sua conta; não compartilhe a senha no chat.'; target = 'documents' }
  else if (/arquivo|formato|pdf|10 mb|limite de 10/.test(text) || status === 413) { title = 'Confira o anexo'; guidance = 'Use um PDF, JPG ou PNG válido, com conteúdo e até 10 MB. Cada empréstimo aceita até 10 termos impressos; confira os anexos existentes.'; target = 'documents' }
  else if (status >= 500 || /conex[aã]o|network|rede|timeout|servidor/.test(text)) { title = readOnly ? 'Não foi possível consultar os dados' : 'Não foi possível confirmar o resultado'; guidance = readOnly ? 'Confira a conexão e use a opção de atualizar a consulta. Se persistir, informe a referência ao suporte.' : 'Confira a conexão e consulte a situação ou a lista antes de repetir uma gravação, pois ela pode ter sido recebida. Se persistir, envie a referência ao suporte.'; target = readOnly ? 'refresh' : 'uncertain' }
  return { title, message, guidance, target }
}
