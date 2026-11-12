import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import land from './audit-natural-earth-land.json'

export default function AuditIpMap({ location, label }) {
  const target = useRef(null)
  const { latitude, longitude, radius_km: radius } = location

  useEffect(() => {
    const coordinates = [Math.max(-85, Math.min(85, latitude)), longitude]
    const map = L.map(target.current, {
      zoomControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false,
      touchZoom: false, attributionControl: false,
    }).setView(coordinates, 5)
    L.geoJSON(land, {
      interactive: false, style: { color: '#51756b', weight: 1, fillColor: '#cfdfc4', fillOpacity: 1 },
    }).addTo(map)
    if (Number.isFinite(radius) && radius > 0) {
      const circle = L.circle(coordinates, {
        radius: radius * 1000, color: '#1d56bf', weight: 1.5, fillOpacity: 0.15, interactive: false,
      }).addTo(map)
      map.fitBounds(circle.getBounds(), { padding: [26, 20], maxZoom: 5, animate: false })
    }
    L.circleMarker(coordinates, {
      radius: 7, color: '#fff', weight: 2, fillColor: '#1d56bf', fillOpacity: 1, interactive: false,
    }).addTo(map)
    return () => map.remove()
  }, [latitude, longitude, radius])

  return <div ref={target} className="audit-access__map" role="img" aria-label={`Mapa da região aproximada do IP. ${label}`} />
}
