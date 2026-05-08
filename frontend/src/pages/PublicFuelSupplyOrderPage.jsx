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
        setError(getApiErrorMessage(err, 'Não foi possível validar o comprovante público da ordem.'))
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
      setFeedback(`Link público: ${publicUrl}`)
      return
    }
    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback('Link público copiado para a área de transferência.')
    } catch {
      setFeedback('Não foi possível copiar o link automaticamente.')
    }
  }

  return (
    <div className="public-order-shell">
      <div className="public-order-card">
        <header className="public-order-header">
          <div>
            <span className="public-order-eyebrow">{officialBrand.systemName} . validação pública</span>
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
                <span className="muted">Número da ordem</span>
                <strong>{formatOrderNumber(order)}</strong>
                <span className={`status-badge ${getOrderStatusClass(order.status)}`}>{getOrderStatusLabel(order.status)}</span>
              </div>
              <div className="public-order-highlight">
                <span className="muted">Código de validação</span>
                <strong>{order.validation_code}</strong>
                <span className="muted">Emitida em {formatDate(order.created_at)}</span>
              </div>
            </section>

            <section className="public-order-grid">
              <article className="public-order-block">
                <h2>Dados operacionais</h2>
                <dl>
                  <div><dt>Veículo</dt><dd>{order.vehicle_description || order.vehicle_plate || '-'}</dd></div>
                  <div><dt>Condutor</dt><dd>{order.driver_name || 'Não informado'}</dd></div>
                  <div><dt>Órgão solicitante</dt><dd>{order.organization_name || 'Não informado'}</dd></div>
                  <div><dt>Posto credenciado</dt><dd>{order.fuel_station_name || 'Não informado'}</dd></div>
                  <div><dt>Endereço do posto</dt><dd>{order.fuel_station_address || 'Não informado'}</dd></div>
                  <div><dt>CNPJ do posto</dt><dd>{order.fuel_station_cnpj || 'Não informado'}</dd></div>
                  <div><dt>Telefone do posto</dt><dd>{order.fuel_station_phone || 'Não informado'}</dd></div>
                  <div>
                    <dt>Localização do posto</dt>
                    <dd>
                      {order.fuel_station_maps_url ? (
                        <a className="link-inline" href={order.fuel_station_maps_url} target="_blank" rel="noreferrer">Abrir no mapa</a>
                      ) : 'Não informado'}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="public-order-block">
                <h2>Controle institucional</h2>
                <dl>
                  <div><dt>Servidor emissor</dt><dd>{order.created_by_name || 'Não informado'}</dd></div>
                  <div><dt>Contato do emissor</dt><dd>{order.created_by_contact || 'Não informado'}</dd></div>
                  <div><dt>Contato do condutor</dt><dd>{order.driver_contact || 'Não informado'}</dd></div>
                  <div><dt>Valida até</dt><dd>{formatDate(order.expires_at)}</dd></div>
                  <div><dt>Confirmada em</dt><dd>{formatDate(order.confirmed_at)}</dd></div>
                  <div><dt>Concluída por</dt><dd>{order.confirmed_by_name || 'Pendente'}</dd></div>
                  <div><dt>Litros previstos</dt><dd>{formatLiters(order.requested_liters)}</dd></div>
                  <div><dt>Valor máximo</dt><dd>{formatCurrencyBRL(order.max_amount)}</dd></div>
                </dl>
              </article>
            </section>

            {order.notes ? (
              <section className="public-order-notes">
                <h2>Observações</h2>
                <p>{order.notes}</p>
              </section>
            ) : null}

            <section className="public-order-actions">
              <button type="button" className="app-button" onClick={() => downloadFuelSupplyOrderDocument(order)}>
                Baixar comprovante em PDF
              </button>
              <button type="button" className="secondary-button" onClick={() => previewFuelSupplyOrderDocument(order)}>
                Pré-visualizar PDF
              </button>
              <button type="button" className="ghost-button" onClick={handleCopyLink}>
                Copiar link público
              </button>
            </section>

            <footer className="public-order-footer">
              <span>Endereço público de validação</span>
              <strong>{publicUrl}</strong>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}
