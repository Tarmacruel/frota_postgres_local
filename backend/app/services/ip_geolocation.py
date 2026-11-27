from __future__ import annotations

import ipaddress
import logging
from datetime import datetime, timezone
from math import isfinite

from app.core.config import settings

logger = logging.getLogger(__name__)


def _name(record):
    names = record.get("names", {})
    return names.get("pt-BR") or names.get("en") or record.get("iso_code")


def locate_audit_ip(value: str | None):
    if not isinstance(value, str):
        return {"status": "no_ip"}
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return {"status": "no_ip"}
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    if not address.is_global or address.is_multicast:
        return {"status": "non_public"}

    database_path = settings.AUDIT_IP_CITY_MMDB or settings.STORAGE_DIR / "geoip" / "dbip-city-lite.mmdb"
    if not database_path.is_file():
        return {"status": "database_unavailable"}

    try:
        import maxminddb

        with maxminddb.open_database(str(database_path)) as reader:
            record = reader.get(str(address))
            build_epoch = reader.metadata().build_epoch
    except (ImportError, OSError, ValueError, RuntimeError):
        logger.warning("Não foi possível ler a base local de geolocalização.")
        return {"status": "database_unavailable"}
    if not record:
        return {"status": "not_found"}

    location = record.get("location", {})
    latitude, longitude = location.get("latitude"), location.get("longitude")
    has_coordinates = (
        isinstance(latitude, (int, float)) and isinstance(longitude, (int, float))
        and isfinite(latitude) and isfinite(longitude)
        and -90 <= latitude <= 90 and -180 <= longitude <= 180
    )
    subdivisions = record.get("subdivisions") or []
    return {
        "status": "located" if has_coordinates else "no_coordinates",
        "city": _name(record.get("city", {})),
        "region": _name(subdivisions[0]) if subdivisions else None,
        "country": _name(record.get("country", {})),
        "latitude": latitude if has_coordinates else None,
        "longitude": longitude if has_coordinates else None,
        "radius_km": location.get("accuracy_radius"),
        "database_date": datetime.fromtimestamp(build_epoch, timezone.utc).date().isoformat(),
    }
