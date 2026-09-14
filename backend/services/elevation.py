"""
services/elevation.py
Elevation & Slope Harvester
Computes center elevation and terrain steepness from cardinal-offset DEM samples.
Primary engine uses Open-Meteo High-Resolution Elevation API (fast, reliable, free).
Fallback to Open-Elevation API.
"""

import math
import httpx

OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"

# Offset distance in meters for gradient sampling
SAMPLE_OFFSET_M = 50.0


def _offset_point(lat: float, lon: float, bearing_deg: float, distance_m: float):
    """
    Compute a lat/lon offset from a center point given a bearing and distance.
    Uses a simple spherical earth approximation (sufficient for 50 m offsets).
    """
    R = 6_371_000  # Earth radius in meters
    d = distance_m / R
    brng = math.radians(bearing_deg)
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)

    new_lat = math.asin(
        math.sin(lat_r) * math.cos(d)
        + math.cos(lat_r) * math.sin(d) * math.cos(brng)
    )
    new_lon = lon_r + math.atan2(
        math.sin(brng) * math.sin(d) * math.cos(lat_r),
        math.cos(d) - math.sin(lat_r) * math.sin(new_lat),
    )
    return round(math.degrees(new_lat), 7), round(math.degrees(new_lon), 7)


async def _fetch_from_open_meteo(points: list[tuple[float, float]]) -> list[float] | None:
    """Fetch elevation batch using Open-Meteo Elevation API."""
    lats = ",".join(str(p[0]) for p in points)
    lons = ",".join(str(p[1]) for p in points)
    url = f"{OPEN_METEO_ELEVATION_URL}?latitude={lats}&longitude={lons}"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            elevations = data.get("elevation")
            if isinstance(elevations, list) and len(elevations) == len(points):
                return elevations
    return None


async def _fetch_from_open_elevation(points: list[tuple[float, float]]) -> list[float] | None:
    """Fallback fetch elevation batch using Open-Elevation API."""
    locations = [{"latitude": p[0], "longitude": p[1]} for p in points]
    payload = {"locations": locations}
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(OPEN_ELEVATION_URL, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if len(results) == len(points):
                return [r["elevation"] for r in results]
    return None


async def fetch_elevation_and_slope(lat: float, lon: float) -> dict:
    """
    Fetch elevation at the center and 4 cardinal points 50 m away,
    then compute terrain slope in degrees.

    Points: Center (0), North (1), South (2), East (3), West (4)
    Slope = arctan(sqrt((dz/dx)^2 + (dz/dy)^2)) * 180/π
    """
    north = _offset_point(lat, lon, 0, SAMPLE_OFFSET_M)
    south = _offset_point(lat, lon, 180, SAMPLE_OFFSET_M)
    east = _offset_point(lat, lon, 90, SAMPLE_OFFSET_M)
    west = _offset_point(lat, lon, 270, SAMPLE_OFFSET_M)

    points = [
        (lat, lon),     # 0: center
        north,          # 1: North
        south,          # 2: South
        east,           # 3: East
        west,           # 4: West
    ]

    # Try Open-Meteo elevation first (fast & reliable)
    elevations = None
    try:
        elevations = await _fetch_from_open_meteo(points)
    except Exception:
        pass

    # Fallback to Open-Elevation
    if not elevations:
        try:
            elevations = await _fetch_from_open_elevation(points)
        except Exception:
            pass

    if not elevations or len(elevations) < 5:
        # If all elevation APIs fail, default to plain terrain (1.5°) — never assume steep slope
        return {
            "elevation_m": elevations[0] if elevations else 430.0,
            "slope_degrees": 1.5,
        }

    elev_center = round(elevations[0], 1)
    elev_north = elevations[1]
    elev_south = elevations[2]
    elev_east = elevations[3]
    elev_west = elevations[4]

    # Gradient in Y direction (N-S) and X direction (E-W)
    dz_dy = (elev_north - elev_south) / (2 * SAMPLE_OFFSET_M)
    dz_dx = (elev_east - elev_west) / (2 * SAMPLE_OFFSET_M)

    slope_rad = math.atan(math.sqrt(dz_dx**2 + dz_dy**2))
    # Clamp: flat plain ~0-2m rise → small angle; minimum 0.5° to avoid divide-by-zero downstream
    slope_deg = max(0.5, round(math.degrees(slope_rad), 2))

    return {
        "elevation_m": elev_center,
        "slope_degrees": slope_deg,
    }
