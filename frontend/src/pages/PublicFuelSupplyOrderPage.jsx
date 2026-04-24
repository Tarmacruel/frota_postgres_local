import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fuelSupplyOrdersAPI } from '../api/fuelSupplyOrders'
import { officialBrand } from '../constants/officialBrand'
import { getApiErrorMessage } from '../utils/apiError'
import { downloadFuelSupplyOrderDocument, previewFuelSupplyOrderDocument } from '../utils/fuelSupplyOrderDocument'
import {
  formatCurrencyBRL,
  formatOrderNumber,
  getOrderStatusClass,
  getOrderStatusLabel,
  resolvePublicValidationUrl,
} from '../utils/fuelSupplyOrders'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatLiters(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`
}

export default function PublicFuelSupplyOrderPage() {
  const { validationCode } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    async function loadOrder() {
      try {
        setLoading(true)
        setError('')
        const { data } = await fuelSupplyOrdersAPI.getPublic(validationCode)
        setOrder(data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel validar o comprovante publico da ordem.'))
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [validationCode])

  const publicUrl = useMemo(() => resolvePublicValidationUrl(order?.public_validation_path), [order?.public_validation_path])

  async function handleCopyLink() {
    if (!publicUrl) return
    if (!navigator.clipboard) {
      setFeedback(`Link publico: ${publicUrl}`)
      return
    }
    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback('Link publico copiado para a area de transferencia.')
    } catch {
      setFeedback('Nao foi possivel copiar o link automaticamente.')
    }
  }

  return (
    <div className="public-order-shell">
      <div className="public-order-card">
        <header className="public-order-header">
          <div>
            <span className="public-order-eyebrow">{officialBrand.systemName} . validacao publica</span>
            <h1>Comprovante institucional de ordem de abastecimento</h1>
            <p>
              Este ambiente permite consultar e baixar novamente o documento oficial emitido pela Prefeitura Municipal de
              Teixeira de Freitas, sem necessidade de login.
            </p>
          </div>
          <div className="public-order-brand">
            <strong>{officialBrand.municipality}</strong>
            <span>CNPJ {officialBrand.cnpj}</span>
          </div>
        </header>

        {loading ? <div className="alert alert-info">Validando autenticidade do comprovante...</div> : null}
        {!loading && error ? <div className="alert alert-error">{error}</div> : null}
        {!loading && feedback ? <div className="alert alert-info">{feedback}</div> : null}

        {!loading && order ? (
          <>
            <section className="public-order-summary">
              <div className="public-order-highlight">
                <span className="muted">Numero da ordem</span>
                <strong>{formatOrderNumber(order)}</strong>
                <span className={`status-badge ${getOrderStatusClass(order.status)}`}>{getOrderStatusLabel(order.status)}</span>
              </div>
              <div className="public-order-highlight">
                <span className="muted">Codigo de validacao</span>
                <strong>{order.validation_code}</strong>
                <span className="muted">Emitida em {formatDate(order.created_at)}</span>
              </div>
            </section>

            <section className="public-order-grid">
              <article className="public-order-block">
                <h2>Dados operacionais</h2>
                <dl>
                  <div><dt>Veiculo</dt><dd>{order.vehicle_description || order.vehicle_plate || '-'}</dd></div>
                  <div><dt>Condutor</dt><dd>{order.driver_name || 'Nao informado'}</dd></div>
                  <div><dt>Orgao solicitante</dt><dd>{order.organization_name || 'Nao informado'}</dd></div>
                  <div><dt>Posto credenciado</dt><dd>{order.fuel_station_name || 'Nao informado'}</dd></div>
                  <div><dt>Endereco do posto</dt><dd>{order.fuel_station_address || 'Nao informado'}</dd></div>
                  <div><dt>CNPJ do posto</dt><dd>{order.fuel_station_cnpj || 'Nao informado'}</dd></div>
                </dl>
              </article>

              <article className="public-order-block">
                <h2>Controle institucional</h2>
                <dl>
                  <div><dt>Servidor emissor</dt><dd>{order.created_by_name || 'Nao informado'}</dd></div>
                  <div><dt>Valida ate</dt><dd>{formatDate(order.expires_at)}</dd></div>
                  <div><dt>Confirmada em</dt><dd>{formatDate(order.confirmed_at)}</dd></div>
                  <div><dt>Concluida por</dt><dd>{order.confirmed_by_name || 'Pendente'}</dd></div>
                  <div><dt>Litros previstos</dt><dd>{formatLiters(order.requested_liters)}</dd></div>
                  <div><dt>Valor maximo</dt><dd>{formatCurrencyBRL(order.max_amount)}</dd></div>
                </dl>
              </article>
            </section>

            {order.notes ? (
              <section className="public-order-notes">
                <h2>Observacoes</h2>
                <p>{order.notes}</p>
              </section>
            ) : null}

            <section className="public-order-actions">
              <button type="button" className="app-button" onClick={() => downloadFuelSupplyOrderDocument(order)}>
                Baixar comprovante em PDF
              </button>
              <button type="button" className="secondary-button" onClick={() => previewFuelSupplyOrderDocument(order)}>
                Previsualizar PDF
              </button>
              <button type="button" className="ghost-button" onClick={handleCopyLink}>
                Copiar link publico
              </button>
            </section>

            <footer className="public-order-footer">
              <span>Endereco publico de validacao</span>
              <strong>{publicUrl}</strong>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}
