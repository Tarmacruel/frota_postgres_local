// frontend/src/context/MasterDataContext.jsx
import { createContext, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * Contexto para compartilhamento de dados mestres da frota
 * Evita prop-drilling e permite cache centralizado de veículos, órgãos, etc.
 */
export const MasterDataContext = createContext(undefined);

MasterDataContext.displayName = 'MasterDataContext';

/**
 * Provider do contexto de dados mestres
 * @param {Object} props - Propriedades do componente
 * @param {React.ReactNode} props.children - Componentes filhos
 */
export function MasterDataProvider({ children }) {
  // Estados para armazenamento em cache
  const [cache, setCache] = useState({
    vehicles: [],
    organs: [],
    drivers: [],
    vehicleTypes: [],
    locations: [],
    lastUpdate: null,
  });

  // Função para atualizar cache parcialmente
  const updateCache = useCallback((key, data) => {
    setCache(prev => ({
      ...prev,
      [key]: data,
      lastUpdate: Date.now(),
    }));
  }, []);

  // Função para limpar cache específico
  const clearCache = useCallback((key) => {
    if (key) {
      setCache(prev => ({ ...prev, [key]: [], lastUpdate: Date.now() }));
    } else {
      setCache({
        vehicles: [],
        organs: [],
        drivers: [],
        vehicleTypes: [],
        locations: [],
        lastUpdate: Date.now(),
      });
    }
  }, []);

  // Valores memorizados para otimização de performance
  const value = useMemo(() => ({
    // Dados em cache
    vehicles: cache.vehicles,
    organs: cache.organs,
    drivers: cache.drivers,
    vehicleTypes: cache.vehicleTypes,
    locations: cache.locations,
    lastUpdate: cache.lastUpdate,
    
    // Ações
    updateCache,
    clearCache,
    
    // Helpers de busca rápida
    findVehicle: (id) => cache.vehicles.find(v => v.id === id),
    findOrgan: (id) => cache.organs.find(o => o.id === id),
    findDriver: (id) => cache.drivers.find(d => d.id === id),
    
    // Filtros utilitários
    getActiveVehicles: () => cache.vehicles.filter(v => v.status === 'active'),
    getVehiclesByOrgan: (organId) => cache.vehicles.filter(v => v.organ_id === organId),
    getVehiclesByType: (type) => cache.vehicles.filter(v => v.vehicle_type === type),
  }), [cache, updateCache, clearCache]);

  return (
    <MasterDataContext.Provider value={value}>
      {children}
    </MasterDataContext.Provider>
  );
}

// Validação de props para desenvolvimento
MasterDataProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default MasterDataContext;