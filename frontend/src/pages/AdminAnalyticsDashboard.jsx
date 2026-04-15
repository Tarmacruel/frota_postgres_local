// frontend/src/pages/AdminAnalyticsDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';

/**
 * Dashboard de Analytics Avançado - Acesso restrito a Administradores
 * Versão compatível com a estrutura atual do projeto
 */
export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Estados de dados
  const [overview, setOverview] = useState(null);
  const [efficiency, setEfficiency] = useState([]);
  const [insights, setInsights] = useState([]);

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [vehicleType, setVehicleType] = useState('');

  // Função para carregar dados do analytics
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        period_days: periodDays,
        vehicle_type: vehicleType || undefined,
      };

      // Buscar dados em paralelo com tratamento de erro individual
      const [overviewRes, efficiencyRes, insightsRes] = await Promise.all([
        api.get('/api/analytics/overview', { params }).catch(() => ({ data: null })),
        api.get('/api/analytics/efficiency', { params }).catch(() => ({ data: [] })),
        api.get('/api/analytics/insights', { params }).catch(() => ({ data: [] })),
      ]);

      setOverview(overviewRes.data);
      setEfficiency(Array.isArray(efficiencyRes.data) ? efficiencyRes.data : []);
      setInsights(Array.isArray(insightsRes.data) ? insightsRes.data : []);
    } catch (err) {
      console.error('Erro ao carregar analytics:', err);
      setError('Falha ao carregar dados. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, [periodDays, vehicleType]);

  // Efeito para carregar dados quando usuário autenticado como ADMIN
  useEffect(() => {
    if (!authLoading && user?.role === 'ADMIN') {
      loadData();
    }
  }, [authLoading, user, loadData]);

  // Efeito para redirecionar se não for ADMIN
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      navigate('/unauthorized', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Handlers de filtro
  const handlePeriodChange = (e) => setPeriodDays(Number(e.target.value));
  const handleTypeChange = (e) => setVehicleType(e.target.value);
  const handleRefresh = () => loadData();

  // Formatações utilitárias
  const fmtNum = (n, d = 1) =>
    n != null ? Number(n).toFixed(d).replace('.', ',') : '-';

  const fmtCur = (v) =>
    v != null
      ? new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(v)
      : '-';

  const getSeverityBadge = (severity) => {
    const map = {
      CRITICAL: 'bg-red-100 text-red-800 border-red-300',
      HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
      MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      LOW: 'bg-green-100 text-green-800 border-green-300',
    };
    return map[severity] || map.LOW;
  };

  // Estado: Loading inicial
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando analytics...</p>
        </div>
      </div>
    );
  }

  // Estado: Sem permissão de acesso
  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  // Estado: Erro
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Analytics Avançado</h1>
          <p className="text-gray-600">Métricas de eficiência da frota</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium mb-3">⚠️ {error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Renderização principal
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🧠 Analytics Avançado</h1>
              <p className="text-gray-600 mt-1">Business Intelligence para gestão da frota</p>
            </div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
            >
              🔄 Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Período
            </label>
            <select
              value={periodDays}
              onChange={handlePeriodChange}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-w-[140px]"
            >
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
              <option value={365}>365 dias</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Veículo
            </label>
            <select
              value={vehicleType}
              onChange={handleTypeChange}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-w-[140px]"
            >
              <option value="">Todos</option>
              <option value="SEDAN">Sedan</option>
              <option value="HATCH">Hatch</option>
              <option value="SUV">SUV</option>
              <option value="PICAPE">Picape</option>
              <option value="VAN">Van</option>
              <option value="ONIBUS">Ônibus</option>
              <option value="CAMINHAO">Caminhão</option>
            </select>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="px-6 py-6 space-y-6">
        {/* Cards de KPI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Consumo Médio */}
          <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500">
            <p className="text-sm text-gray-600">Consumo Médio</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmtNum(overview?.average_consumption_l_100km, 1)}{' '}
              <span className="text-base font-normal">L/100km</span>
            </p>
          </div>

          {/* Custo por KM */}
          <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Custo por KM</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmtCur(overview?.average_tco_per_km)}{' '}
              <span className="text-base font-normal">/km</span>
            </p>
          </div>

          {/* Alertas Ativos */}
          <div className="bg-white rounded-lg shadow p-5 border-l-4 border-orange-500">
            <p className="text-sm text-gray-600">Alertas Ativos</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {overview?.active_alerts ?? 0}
            </p>
          </div>

          {/* Frota Ativa */}
          <div className="bg-white rounded-lg shadow p-5 border-l-4 border-purple-500">
            <p className="text-sm text-gray-600">Frota Ativa</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {overview?.fleet_active ?? 0}
            </p>
          </div>
        </div>

        {/* Grid: Eficiência + Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tabela de Eficiência por Tipo */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">
                Eficiência por Tipo de Veículo
              </h3>
              <p className="text-sm text-gray-500">Consumo em L/100km</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tipo
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Média
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Veículos
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(efficiency.length > 0 ? efficiency : [
                    { vehicle_type: 'Sem dados', category_average: 0, vehicle_count: 0 },
                  ]).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {item.vehicle_type || 'N/A'}
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {fmtNum(item.category_average ?? item.avg_consumption, 1)} L/100km
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {item.vehicle_count ?? item.count ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lista de Insights Inteligentes */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">🎯 Insights Inteligentes</h3>
              <p className="text-sm text-gray-500">Recomendações baseadas em dados</p>
            </div>
            <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
              {(insights.length > 0 ? insights : [
                { message: 'Nenhum insight no período selecionado.', severity: 'LOW' },
              ]).map((insight, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border-l-4 ${getSeverityBadge(insight.severity)}`}
                >
                  <p className="text-sm text-gray-800">
                    {insight.message || insight.description}
                  </p>
                  {insight.recommended_action && (
                    <p className="text-xs text-gray-600 mt-1">
                      💡 <strong>Ação:</strong> {insight.recommended_action}
                    </p>
                  )}
                  {insight.variance_percentage != null && (
                    <p
                      className={`text-xs mt-1 font-medium ${
                        insight.variance_percentage > 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {insight.variance_percentage > 0 ? '↑' : '↓'}{' '}
                      {Math.abs(insight.variance_percentage).toFixed(1)}% vs média
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela de Detalhamento */}
        {efficiency.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">
                Detalhamento por Veículo (Top 20)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Veículo
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tipo
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      KM
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Consumo
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      TCO/km
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {efficiency.slice(0, 20).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {item.plate || item.vehicle_name || `Veículo #${idx + 1}`}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {item.vehicle_type || 'N/A'}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {fmtNum(item.total_km ?? item.km, 0)} km
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            (item.consumption_l_100km ?? 0) >
                              (item.category_average_consumption ?? 999) * 1.2
                              ? 'text-red-600 font-medium'
                              : (item.consumption_l_100km ?? 0) <
                                  (item.category_average_consumption ?? 0) * 0.9
                              ? 'text-green-600 font-medium'
                              : 'text-gray-700'
                          }
                        >
                          {fmtNum(item.consumption_l_100km ?? item.consumption, 1)} L/100km
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-700">
                        {fmtCur(item.tco_cost_per_km ?? item.tco)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Rodapé */}
      <footer className="px-6 py-4 text-center text-sm text-gray-500 border-t bg-white">
        <p>
          Última atualização: {new Date().toLocaleString('pt-BR')} • Período: {periodDays} dias
          {vehicleType && ` • Tipo: ${vehicleType}`}
        </p>
      </footer>
    </div>
  );
}