import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [-17.5394, -39.7413]
const DEFAULT_ZOOM = 13
const SELECTED_ZOOM = 17

function parseCoordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null
  return parsed
}

function formatCoordinate(value) {
  return Number(value).toFixed(6)
}

function buildMarkerIcon() {
  return L.divIcon({
    className: 'station-location-marker',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

export default function StationLocationPicker({ latitude, longitude, onChange }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onChangeRef = useRef(onChange)

  const selectedPosition = useMemo(() => {
    const parsedLatitude = parseCoordinate(latitude, -90, 90)
    const parsedLongitude = parseCoordinate(longitude, -180, 180)
    if (parsedLatitude === null || parsedLongitude === null) return null
    return { lat: parsedLatitude, lng: parsedLongitude }
  }, [latitude, longitude])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined

    const initialCenter = selectedPosition ? [selectedPosition.lat, selectedPosition.lng] : DEFAULT_CENTER
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(initialCenter, selectedPosition ? SELECTED_ZOOM : DEFAULT_ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    map.on('click', (event) => {
      onChangeRef.current?.({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      })
    })

    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedPosition) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    const latLng = [selectedPosition.lat, selectedPosition.lng]
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: buildMarkerIcon() }).addTo(map)
    } else {
      markerRef.current.setLatLng(latLng)
    }

    map.setView(latLng, Math.max(map.getZoom(), SELECTED_ZOOM), { animate: true })
  }, [selectedPosition])

  function handleClearLocation() {
    onChangeRef.current?.(null)
  }

  return (
    <div className="station-location-picker">
      <div
        ref={mapContainerRef}
        className="station-location-map"
        aria-label="Mapa para seleção da localização do posto"
      />
      <div className="station-location-footer">
        <div className="station-location-coordinates">
          <span>Ponto selecionado</span>
          <strong>
            {selectedPosition
              ? `${formatCoordinate(selectedPosition.lat)}, ${formatCoordinate(selectedPosition.lng)}`
              : 'Não informado'}
          </strong>
        </div>
        <div className="actions-inline station-location-actions">
          <button className="mini-button" type="button" onClick={handleClearLocation} disabled={!selectedPosition}>
            Limpar
          </button>
        </div>
      </div>
    </div>
  )
}
