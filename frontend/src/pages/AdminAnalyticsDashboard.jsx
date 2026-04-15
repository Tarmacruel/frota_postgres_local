// frontend/src/pages/AdminAnalyticsDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

/**
 * Dashboard de Analytics - Versão Minimalista
 * Sem dependências de arquivos customizados
 */
export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  // Estados
  const [overview, setOverview] = useState(null);
  const [efficiency, setEfficiency] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);

  // Configurar baseURL do axios
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    withCredentials: true,
  });

  // Interceptor para adicionar token
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = { period_days: periodDays };
      
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
  }, [periodDays]);

  // Efeito inicial
  useEffect(() => {
    if (!authLoading && user?.role === 'ADMIN') {
      loadData();
    }
  }, [authLoading, user, loadData]);

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      navigate('/unauthorized', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Formatações simples
  const fmtNum = (n, d = 1) => n != null ? Number(n).toFixed(d).replace('.', ',') : '-';
  const fmtCur = (v) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

  // Loading
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Sem permissão
  if (!user || user.role !== 'ADMIN') return null;

  // Erro
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 mb-2">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-red-600 text-white rounded">Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow px-6 py-4">
        <h1 className="text-2xl font-bold">🧠 Analytics</h1>
        <p className="text-gray-600">Métricas da frota</p>
      </div>

      {/* Filtro */}
      <div className="bg-white border-b px-6 py-4">
        <label className="mr-2 font-medium">Período:</label>
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
        <button onClick={loadData} className="ml-4 px-4 py-1 bg-blue-600 text-white rounded">Atualizar</button>
      </div>

      {/* Conteúdo */}
      <main className="p-6 space-y-6">
        
        {/* KPIs */}
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

        {/* Eficiência */}
        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Eficiência por Tipo</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Média</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Veículos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(efficiency.length > 0 ? efficiency : [{ vehicle_type: 'Sem dados', category_average: 0, vehicle_count: 0 }]).map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium">{item.vehicle_type || 'N/A'}</td>
                  <td className="px-5 py-4">{fmtNum(item.category_average || item.avg_consumption, 1)} L/100km</td>
                  <td className="px-5 py-4">{item.vehicle_count || item.count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insights */}
        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">🎯 Insights</h3>
          </div>
          <div className="p-5 space-y-3">
            {(insights.length > 0 ? insights : [{ message: 'Nenhum insight no período.', severity: 'LOW' }]).map((insight, idx) => (
              <div key={idx} className="p-4 rounded border-l-4 bg-gray-50">
                <p className="text-sm">{insight.message || insight.description}</p>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}// frontend/src/pages/AdminAnalyticsDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

/**
 * Dashboard de Analytics - Versão Minimalista
 * Sem dependências de arquivos customizados
 */
export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  // Estados
  const [overview, setOverview] = useState(null);
  const [efficiency, setEfficiency] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [periodDays, setPeriodDays] = useState(30);

  // Configurar baseURL do axios
  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    withCredentials: true,
  });

  // Interceptor para adicionar token
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = { period_days: periodDays };
      
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
  }, [periodDays]);

  // Efeito inicial
  useEffect(() => {
    if (!authLoading && user?.role === 'ADMIN') {
      loadData();
    }
  }, [authLoading, user, loadData]);

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      navigate('/unauthorized', { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Formatações simples
  const fmtNum = (n, d = 1) => n != null ? Number(n).toFixed(d).replace('.', ',') : '-';
  const fmtCur = (v) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

  // Loading
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Sem permissão
  if (!user || user.role !== 'ADMIN') return null;

  // Erro
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 mb-2">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-red-600 text-white rounded">Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow px-6 py-4">
        <h1 className="text-2xl font-bold">🧠 Analytics</h1>
        <p className="text-gray-600">Métricas da frota</p>
      </div>

      {/* Filtro */}
      <div className="bg-white border-b px-6 py-4">
        <label className="mr-2 font-medium">Período:</label>
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
        <button onClick={loadData} className="ml-4 px-4 py-1 bg-blue-600 text-white rounded">Atualizar</button>
      </div>

      {/* Conteúdo */}
      <main className="p-6 space-y-6">
        
        {/* KPIs */}
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

        {/* Eficiência */}
        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Eficiência por Tipo</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Média</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">Veículos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(efficiency.length > 0 ? efficiency : [{ vehicle_type: 'Sem dados', category_average: 0, vehicle_count: 0 }]).map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium">{item.vehicle_type || 'N/A'}</td>
                  <td className="px-5 py-4">{fmtNum(item.category_average || item.avg_consumption, 1)} L/100km</td>
                  <td className="px-5 py-4">{item.vehicle_count || item.count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insights */}
        <div className="bg-white rounded shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">🎯 Insights</h3>
          </div>
          <div className="p-5 space-y-3">
            {(insights.length > 0 ? insights : [{ message: 'Nenhum insight no período.', severity: 'LOW' }]).map((insight, idx) => (
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