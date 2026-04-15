// frontend/src/pages/AdminAnalyticsDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/axios';

export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [overview, setOverview] = useState(null);
  const [efficiency, setEfficiency] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [vehicleType, setVehicleType] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = { period_days: periodDays, vehicle_type: vehicleType || undefined };
      
      const [overviewRes, efficiencyRes, insightsRes] = await Promise.all([
        api.get('/api/analytics/overview', { params }).catch(() => ({ data: null })),
        api.get('/api/analytics/efficiency', { params }).catch(() => ({ data: [] })),
        api.get('/api/analytics/insights', { params }).catch(() => ({ data: [] })),
      ]);

      setOverview(overviewRes.data);
      setEfficiency(Array.isArray(efficiencyRes.data) ? efficiencyRes.data : []);
      setInsights(Array.isArray(insightsRes.data) ? insightsRes.data : []);
    } catch (err) {
      console.error('Erro analytics:', err);
      setError('Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [periodDays, vehicleType]);

  useEffect(() => {
    if (!authLoading && user?.role === 'ADMIN') {
      loadData();
    }
  }, [authLoading, user, loadData]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      navigate('/unauthorized', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const fmtNum = (n, d = 1) => n != null ? Number(n).toFixed(d).replace('.', ',') : '-';
  const fmtCur = (v) => v != null 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) 
    : '-';

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') return null;
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 mb-2">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-red-600 text-white rounded">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow px-6 py-4">
        <h1 className="text-2xl font-bold">🧠 Analytics</h1>
      </div>
      
      <div className="bg-white border-b px-6 py-4">
        <div className="flex gap-4">
          <select 
            value={periodDays} 
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="border rounded px-3 py-1"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>365 dias</option>
          </select>
          <select 
            value={vehicleType} 
            onChange={(e) => setVehicleType(e.target.value)}
            className="border rounded px-3 py-1"
          >
            <option value="">Todos os tipos</option>
            <option value="SEDAN">Sedan</option>
            <option value="PICAPE">Picape</option>
            <option value="VAN">Van</option>
            <option value="ONIBUS">Ônibus</option>
          </select>
          <button onClick={loadData} className="px-4 py-1 bg-blue-600 text-white rounded">
            Atualizar
          </button>
        </div>
      </div>

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded shadow border-l-4 border-blue-500">
            <p className="text-sm text-gray-600">Consumo Médio</p>
            <p className="text-2xl font-bold">{fmtNum(overview?.average_consumption_l_100km, 1)} L/100km</p>
          </div>
          <div className="bg-white p-5 rounded shadow border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Custo/km</p>
            <p className="text-2xl font-bold">{fmtCur(overview?.average_tco_per_km)}</p>
          </div>
          <div className="bg-white p-5 rounded shadow border-l-4 border-orange-500">
            <p className="text-sm text-gray-600">Alertas</p>
            <p className="text-2xl font-bold">{overview?.active_alerts || 0}</p>
          </div>
          <div className="bg-white p-5 rounded shadow border-l-4 border-purple-500">
            <p className="text-sm text-gray-600">Frota Ativa</p>
            <p className="text-2xl font-bold">{overview?.fleet_active || 0}</p>
          </div>
        </div>

        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b font-semibold">Eficiência por Tipo</div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Média</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Veículos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(efficiency.length > 0 ? efficiency : [{ vehicle_type: 'Sem dados', category_average: 0, vehicle_count: 0 }])
                .map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium">{item.vehicle_type || 'N/A'}</td>
                  <td className="px-5 py-4">{fmtNum(item.category_average || item.avg_consumption, 1)} L/100km</td>
                  <td className="px-5 py-4">{item.vehicle_count || item.count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b font-semibold">🎯 Insights</div>
          <div className="p-5 space-y-3">
            {(insights.length > 0 ? insights : [{ message: 'Nenhum insight no período.', severity: 'LOW' }])
              .map((insight, idx) => (
              <div key={idx} className="p-4 rounded border-l-4 bg-gray-50">
                <p className="text-sm">{insight.message || insight.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}