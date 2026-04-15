// frontend/src/hooks/useMasterDataCatalog.js
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/axios';

/**
 * Hook personalizado para dados mestres - Versão Simplificada
 * NÃO requer MasterDataContext - funciona standalone
 */
export const useMasterDataCatalog = () => {
  const [vehicles, setVehicles] = useState([]);
  const [organs, setOrgans] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVehicles = useCallback(async () => {
    try {
      const response = await api.get('/api/vehicles', {
        params: { limit: 1000, status: 'active' }
      });
      setVehicles(response.data.items || response.data || []);
    } catch (err) {
      console.error('Erro ao buscar veículos:', err);
      setVehicles([]);
    }
  }, []);

  const fetchOrgans = useCallback(async () => {
    try {
      const response = await api.get('/api/organs', { params: { limit: 500 } });
      setOrgans(response.data.items || response.data || []);
    } catch (err) {
      console.error('Erro ao buscar órgãos:', err);
      setOrgans([]);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await api.get('/api/drivers', {
        params: { limit: 1000, status: 'active' }
      });
      setDrivers(response.data.items || response.data || []);
    } catch (err) {
      console.error('Erro ao buscar motoristas:', err);
      setDrivers([]);
    }
  }, []);

  const fetchVehicleTypes = useCallback(async () => {
    try {
      const response = await api.get('/api/vehicle-types');
      setVehicleTypes(response.data || []);
    } catch (err) {
      // Fallback se endpoint não existir
      setVehicleTypes([
        { id: 'SEDAN', name: 'Sedan' },
        { id: 'HATCH', name: 'Hatch' },
        { id: 'SUV', name: 'SUV' },
        { id: 'PICAPE', name: 'Picape' },
        { id: 'VAN', name: 'Van' },
        { id: 'ONIBUS', name: 'Ônibus' },
        { id: 'CAMINHAO', name: 'Caminhão' },
      ]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchVehicles(),
        fetchOrgans(),
        fetchDrivers(),
        fetchVehicleTypes(),
      ]);
    } catch (err) {
      console.error('Erro ao carregar catálogo:', err);
      setError('Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [fetchVehicles, fetchOrgans, fetchDrivers, fetchVehicleTypes]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const refresh = useCallback(() => loadAll(), [loadAll]);

  return {
    vehicles,
    organs,
    drivers,
    vehicleTypes,
    loading,
    error,
    refresh,
    getVehicleById: (id) => vehicles.find(v => v.id === id),
    getOrganById: (id) => organs.find(o => o.id === id),
    getDriverById: (id) => drivers.find(d => d.id === id),
    getVehicleTypeLabel: (typeId) => {
      const type = vehicleTypes.find(t => t.id === typeId);
      return type?.name || typeId;
    },
  };
};

export default useMasterDataCatalog;