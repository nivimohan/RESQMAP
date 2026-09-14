"""
services/weather.py
Live Weather Engine — Open-Meteo API
Fetches current precipitation and computes 48-hour rainfall accumulation.
"""

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_weather(lat: float, lon: float) -> dict:
    """
    Query Open-Meteo for hourly precipitation over the next 48 hours.

    Returns:
        current_rainfall_mm:       Current hour's precipitation.
        accumulated_48h_rainfall_mm: Sum of all hourly precipitation over 48h.
        max_hourly_rate_mm:        Peak single-hour precipitation rate.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "precipitation,rain",
        "current_weather": "true",
        "forecast_days": 2,
        "timezone": "auto",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    hourly = data.get("hourly", {})
    precip_values = hourly.get("precipitation", [])
    rain_values = hourly.get("rain", [])

    # Use whichever array has values; prefer 'precipitation' which includes all forms
    values = precip_values if precip_values else rain_values
    values = [v for v in values if v is not None]

    current_rainfall = values[0] if values else 0.0
    accumulated_48h = round(sum(values), 2)
    max_hourly_rate = round(max(values), 2) if values else 0.0

    # Current weather block
    current_weather = data.get("current_weather", {})

    return {
        "current_rainfall_mm": current_rainfall,
        "accumulated_48h_rainfall_mm": accumulated_48h,
        "max_hourly_rate_mm": max_hourly_rate,
        "temperature_c": current_weather.get("temperature"),
        "wind_speed_kmh": current_weather.get("windspeed"),
    }
