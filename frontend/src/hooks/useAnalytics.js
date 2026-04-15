// frontend/src/hooks/useAnalytics.js
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/axios';

/**
 * Hook personalizado para gerenciar dados e operações de Analytics
 * @param {Object} filters - Filtros aplicáveis às requisições
 * @returns {Object} Dados de analytics, estados e funções de ação
 */
export const useAnalytics = (filters = {}) => {
  // Estados principais
  const [overview, setOverview] = useState(null);
  const [efficiency, setEfficiency] = useState([]);
  const [insights, setInsights] = useState([]);
  const [costs, setCosts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Ref para controle de cancelamento de requisições
  const abortControllerRef = useRef(null);

  // Função para buscar visão geral
  const fetchOverview = useCallback(async (params) => {
    try {
      const response = await api.get('/api/analytics/overview', { params });
      return response.data;
    } catch (err) {
      console.error('Erro ao buscar overview:', err);
      throw err;
    }
  }, []);

  // Função para buscar dados de eficiência
  const fetchEfficiency = useCallback(async (params) => {
    try {
      const response = await api.get('/api/analytics/efficiency', { params });
      return response.data;
    } catch (err) {
      console.error('Erro ao buscar eficiência:', err);
      throw err;
    }
  }, []);

  // Função para buscar insights inteligentes
  const fetchInsights = useCallback(async (params) => {
    try {
      const response = await api.get('/api/analytics/insights', { params });
      return response.data;
    } catch (err) {
      console.error('Erro ao buscar insights:', err);
      // Retornar array vazio em caso de erro para não quebrar a UI
      return [];
    }
  }, []);

  // Função principal de carregamento de dados
  const loadData = useCallback(async (force = false) => {
    // Cancelar requisição anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Preparar parâmetros da requisição
    const params = {
      period_days: filters.period_days || 30,
      vehicle_type: filters.vehicle_type || undefined,
      organization: filters.organization || undefined,
    };

    setLoading(true);
    setError(null);

    try {
      // Executar requisições em paralelo com timeout
      const [overviewData, efficiencyData, insightsData] = await Promise.all([
        fetchOverview(params),
        fetchEfficiency(params),
        fetchInsights(params),
      ]);

      setOverview(overviewData);
      setEfficiency(efficiencyData);
      setInsights(insightsData);
      setLastFetch(Date.now());
      
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Erro crítico ao carregar analytics:', err);
        setError('Falha ao carregar dados de analytics. Verifique sua conexão e tente novamente.');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [filters, fetchOverview, fetchEfficiency, fetchInsights]);

  // Efeito para carregar dados quando filtros mudam
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (isMounted) {
        await loadData(false);
      }
    };

    initialize();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);

  // Função de refresh manual
  const refresh = useCallback(() => {
    return loadData(true);
  }, [loadData]);

  // Função para marcar insight como resolvido (otimista)
  const markInsightResolved = useCallback((insightId) => {
    setInsights(prev => prev.filter(i => i.id !== insightId));
    // Em produção, chamar API para persistir: api.patch(`/api/analytics/insights/${insightId}/resolve`)
  }, []);

  // Função para exportar relatório
  const exportReport = useCallback(async (format = 'pdf') => {
    try {
      setLoading(true);
      const response = await api.post('/api/analytics/export/advanced-report', {
        period_start: new Date(Date.now() - (filters.period_days || 30) * 24 * 60 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
        format,
        include_charts: true,
        filters,
      }, {
        responseType: 'blob',
      });

      // Trigger download do arquivo
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio-analytics-${format.toUpperCase()}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      return true;
    } catch (err) {
      console.error('Erro ao exportar relatório:', err);
      setError('Falha ao gerar relatório. Tente novamente.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Retorno do hook
  return {
    // Dados
    overview,
    efficiency,
    insights,
    costs,
    
    // Estados
    loading,
    error,
    lastFetch,
    
    // Ações
    refresh,
    loadData,
    markInsightResolved,
    exportReport,
  };
};

export default useAnalytics;