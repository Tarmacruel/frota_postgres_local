import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { featureGuidesAPI } from '../api/featureGuides'
import GuidedTour from './GuidedTour'
import { TagChip } from './VehicleTags'

// Server state is authoritative: a shared browser must not hide the tour from
// another user, and the same user should not see it again on another device.
export default function VehicleTagsGuide({ userId, enabled }) {
  const { canEdit } = useAuth()
  const editable = Boolean(canEdit?.('vehicles'))
  const [pending, setPending] = useState(false)
  const [running, setRunning] = useState(false)
  const [edition, setEdition] = useState(0)

  useEffect(() => {
    if (!enabled || !userId) return undefined
    let mounted = true
    featureGuidesAPI.getVehicleTags().then(({ data }) => {
      if (mounted && !data?.acknowledged) setPending(true)
    }).catch(() => {
      // Do not block work when the announcement endpoint is unavailable.
      // A new access retries; the replay button remains available.
    })
    return () => { mounted = false }
  }, [enabled, userId])

  useEffect(() => {
    const replay = () => { if (enabled) setPending(true) }
    window.addEventListener('vehicle-tags-guide:replay', replay)
    return () => window.removeEventListener('vehicle-tags-guide:replay', replay)
  }, [enabled])

  useEffect(() => {
    if (!pending || running || !enabled) return undefined
    let timer
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
        setEdition((value) => value + 1)
        setRunning(true)
        setPending(false)
      }, 150)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()
    return () => { window.clearTimeout(timer); observer.disconnect() }
  }, [pending, running, enabled])

  const steps = useMemo(() => [
    {
      title: 'Novidade: etiquetas nos veículos',
      description: <><span className="vehicle-tags" aria-label="Exemplos de etiquetas"><TagChip tag={{ name: 'Em manutenção', color: 'amber' }} /><TagChip tag={{ name: 'Inativo temporariamente', color: 'red' }} /><TagChip tag={{ name: 'Em lavagem', color: 'blue' }} /></span><br />Use etiquetas para comunicar situações do dia a dia. São avisos visuais: não alteram o status do veículo, não bloqueiam operações e não substituem o registro de manutenção ou sinistro. Este tour é apenas explicativo.</>,
    },
    {
      title: 'Veja o aviso e quem o publicou',
      selector: '[data-tour="vehicle-tags-badges"]',
      description: 'As etiquetas aparecem nos veículos, nas posses e nas listas de seleção. Clique em uma etiqueta para consultar autor, data e observação; +N mostra as demais. Todos que já podem consultar o veículo veem suas marcações. Em Posses, são as etiquetas atuais do veículo, inclusive em posses encerradas.',
    },
    ...(editable ? [
      {
        title: '1. Crie seu catálogo pessoal',
        selector: '[data-tour="vehicle-tags-catalog"]',
        description: 'Na tela Veículos, abra Minhas etiquetas; no celular, essa opção fica em Opções. Escolha um nome curto e uma cor, ou use as sugestões. Cada usuário tem seu próprio catálogo: ao aplicar uma etiqueta, sua autoria fica identificada. Você pode editar, arquivar ou excluir as suas etiquetas. Para excluir, retire antes todas as marcações ativas; o histórico será preservado.',
      },
      {
        title: '2. Aplique no veículo',
        description: 'Em Veículos, abra o menu de três pontos da linha e escolha Gerenciar etiquetas. Selecione uma etiqueta do seu catálogo, acrescente uma observação se necessário e clique em Adicionar etiqueta. Um veículo pode ter várias etiquetas, inclusive de autores diferentes. A ação depende da sua permissão para gerenciar o cadastro desse veículo.',
      },
    ] : [{
      title: 'Consulta conforme seu acesso',
      description: 'Seu perfil pode consultar as marcações nos veículos aos quais já tem acesso. Criar e aplicar etiquetas exige permissão de edição de veículos e acesso à gestão do cadastro. Para incluir ou corrigir um aviso, procure o responsável pela etiqueta ou a administração.',
    }]),
    {
      title: 'Encontre os veículos pela etiqueta',
      selector: '[data-tour="vehicle-tags-filter"]',
      description: 'Na tela Veículos, o filtro Etiquetas permite escolher os avisos que deseja acompanhar; no celular, abra Filtros para encontrá-lo. Ao marcar mais de uma, aparecem veículos que tenham pelo menos uma delas. A autoria ajuda a distinguir etiquetas com nomes iguais. Nas listas de seleção de veículo, também é possível pesquisar pelo nome da etiqueta ou do autor.',
    },
    {
      title: 'Terminou a situação? Retire a marcação',
      description: editable
        ? 'Em Gerenciar etiquetas, use Retirar na sua marcação e confirme. A retirada é manual: mudar o status do veículo não remove a etiqueta. Somente o autor ou um administrador pode retirá-la; para retirar a de outro autor, o administrador informa uma justificativa. Arquivar no catálogo impede novas aplicações, mas mantém as marcações existentes.'
        : 'As marcações permanecem até a retirada manual pelo autor ou por um administrador. A mudança de status do veículo não remove etiquetas. Se a informação estiver desatualizada, avise o responsável identificado nos detalhes.',
    },
    {
      title: 'Reveja quando precisar',
      selector: '[data-tour="vehicle-tags-help"]',
      description: 'O botão Como usar etiquetas, na barra superior, abre este tour novamente em qualquer tela. No celular, toque nas suas iniciais e escolha Rever tour das etiquetas. Ao encerrar ou pular, sua visualização fica salva na sua conta e a apresentação automática deixa de aparecer nos próximos acessos.',
    },
  ], [editable])

  if (!enabled || !running) return null
  return <GuidedTour key={edition} steps={steps} autoStart onDismiss={() => setRunning(false)} onFinish={async () => {
    await featureGuidesAPI.acknowledgeVehicleTags()
    setRunning(false)
  }} />
}
