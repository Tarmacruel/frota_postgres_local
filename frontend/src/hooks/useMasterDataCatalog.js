// frontend/src/hooks/useMasterDataCatalog.js
import { useState, useEffect, useContext, useCallback } from 'react';
import { MasterDataContext } from '../context/MasterDataContext';
import api from '../lib/axios';

/**
 * Hook personalizado para gerenciar dados mestres da frota
 * @returns {Object} Dados de veículos, órgãos, motoristas e funções de refresh
 */
export const useMasterDataCatalog = () => {
  // VALIDAÇÃO CRÍTICA: Verificar se o hook está sendo usado dentro do Provider
  const context = useContext(MasterDataContext);
  
  if (context === undefined) {
    throw new Error(
      'useMasterDataCatalog deve ser utilizado dentro de um MasterDataProvider. ' +
      'Verifique se <MasterDataProvider> envolve sua árvore de componentes em main.jsx.'
    );
  }

  // Estados locais para cache e controle
  const [vehicles, setVehicles] = useState([]);
  const [organs, setOrgans] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Função para buscar veículos
  const fetchVehicles = useCallback(async () => {
    try {
      const response = await api.get('/api/vehicles', {
        params: { limit: 1000, status: 'active' }
      });
      setVehicles(response.data.items || response.data || []);
      return true;
    } catch (err) {
      console.error('Erro ao buscar veículos:', err);
      setError('Falha ao carregar veículos');
      return false;
    }
  }, []);

  // Função para buscar órgãos
  const fetchOrgans = useCallback(async () => {
    try {
      const response = await api.get('/api/organs', {
        params: { limit: 500 }
      });
      setOrgans(response.data.items || response.data || []);
      return true;
    } catch (err) {
      console.error('Erro ao buscar órgãos:', err);
      setError('Falha ao carregar órgãos');
      return false;
    }
  }, []);

  // Função para buscar motoristas
  const fetchDrivers = useCallback(async () => {
    try {
      const response = await api.get('/api/drivers', {
        params: { limit: 1000, status: 'active' }
      });
      setDrivers(response.data.items || response.data || []);
      return true;
    } catch (err) {
      console.error('Erro ao buscar motoristas:', err);
      setError('Falha ao carregar motoristas');
      return false;
    }
  }, []);

  // Função para buscar tipos de veículo
  const fetchVehicleTypes = useCallback(async () => {
    try {
      const response = await api.get('/api/vehicle-types');
      setVehicleTypes(response.data || []);
      return true;
    } catch (err) {
      console.error('Erro ao buscar tipos de veículo:', err);
      // Fallback com valores padrão se a API não existir ainda
      setVehicleTypes([
        { id: 'SEDAN', name: 'Sedan' },
        { id: 'HATCH', name: 'Hatch' },
        { id: 'SUV', name: 'SUV' },
        { id: 'PICAPE', name: 'Picape' },
        { id: 'VAN', name: 'Van' },
        { id: 'ONIBUS', name: 'Ônibus' },
        { id: 'CAMINHAO', name: 'Caminhão' },
        { id: 'MOTO', name: 'Motocicleta' },
      ]);
      return true;
    }
  }, []);

  // Função principal de carregamento
  const loadAll = useCallback(async (force = false) => {
    // Evitar refetch muito frequente (cache de 5 minutos)
    const now = Date.now();
    if (!force && lastFetch && (now - lastFetch) < 5 * 60 * 1000) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Executar todas as buscas em paralelo
      const [vehiclesOk, organsOk, driversOk, typesOk] = await Promise.all([
        fetchVehicles(),
        fetchOrgans(),
        fetchDrivers(),
        fetchVehicleTypes(),
      ]);

      if (vehiclesOk && organsOk && driversOk) {
        setLastFetch(Date.now());
      }
    } catch (err) {
      console.error('Erro crítico ao carregar catálogo:', err);
      setError('Falha ao carregar dados mestres. Recarregue a página.');
    } finally {
      setLoading(false);
    }
  }, [fetchVehicles, fetchOrgans, fetchDrivers, fetchVehicleTypes, lastFetch]);

  // Efeito para carregar dados na montagem do hook
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (isMounted) {
        await loadAll(false);
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [loadAll]);

  // Funções utilitárias de busca
  const getVehicleById = useCallback((id) => {
    return vehicles.find(v => v.id === id) || null;
  }, [vehicles]);

  const getOrganById = useCallback((id) => {
    return organs.find(o => o.id === id) || null;
  }, [organs]);

  const getDriverById = useCallback((id) => {
    return drivers.find(d => d.id === id) || null;
  }, [drivers]);

  const getVehicleTypeLabel = useCallback((typeId) => {
    const type = vehicleTypes.find(t => t.id === typeId);
    return type?.name || typeId || 'Não especificado';
  }, [vehicleTypes]);

  // Função de refresh manual
  const refresh = useCallback(() => {
    return loadAll(true);
  }, [loadAll]);

  // Retorno do hook
  return {
    // Dados
    vehicles,
    organs,
    drivers,
    vehicleTypes,
    
    // Estados
    loading,
    error,
    lastFetch,
    
    // Ações
    refresh,
    loadAll,
    
    // Helpers
    getVehicleById,
    getOrganById,
    getDriverById,
    getVehicleTypeLabel,
    
    // Contagens
    counts: {
      vehicles: vehicles.length,
      organs: organs.length,
      drivers: drivers.length,
    },
  };
};

export default useMasterDataCatalog;