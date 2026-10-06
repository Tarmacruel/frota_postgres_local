const TYPE_ASSET = {
  HATCH: 'hatch',
  SEDAN: 'sedan',
  SUV: 'suv',
  PERUA_SW: 'suv',
  PICAPE: 'pickup',
  VAN: 'van',
  MICRO_ONIBUS: 'microbus',
  ONIBUS: 'bus',
  CAMINHAO: 'truck',
  MOTOCICLETA: 'motorcycle',
  MAQUINA: 'machine',
}

const TYPE_LABEL = {
  HATCH: 'Hatch', SEDAN: 'Sedan', SUV: 'SUV', PERUA_SW: 'Perua/SW', PICAPE: 'Picape',
  VAN: 'Van', MICRO_ONIBUS: 'Micro-ônibus', ONIBUS: 'Ônibus', CAMINHAO: 'Caminhão',
  MOTOCICLETA: 'Motocicleta', MAQUINA: 'Máquina',
}

export default function VehicleThumbnail({ vehicleType, plate, className = '' }) {
  const key = String(vehicleType || '').trim().toUpperCase()
  const asset = TYPE_ASSET[key] || 'default'
  const typeLabel = TYPE_LABEL[key] || 'veículo'
  const suffix = plate ? ` ${plate}` : ''
  return (
    <img
      className={`ui-vehicle-thumb ${className}`.trim()}
      src={`${import.meta.env.BASE_URL}vehicle-thumbnails/${asset}.svg`}
      alt={`Miniatura ilustrativa de ${typeLabel}${suffix}`}
      width="52"
      height="34"
      loading="lazy"
      decoding="async"
    />
  )
}
