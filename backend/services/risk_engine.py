"""
services/risk_engine.py
Mathematical Hazard Scoring Core
Combines weather, elevation/slope, and infrastructure metrics into
normalised 0–100 risk scores per hazard dimension and an overall composite score.
"""

import math


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _linear_score(value: float, low: float, high: float) -> float:
    """
    Linearly interpolate value into [0, 100] between [low, high].
    Values below `low` → 0, above `high` → 100.
    """
    if high <= low:
        return 0.0
    return _clamp(((value - low) / (high - low)) * 100)


def compute_landslide_score(
    slope_deg: float | None,
    rainfall_48h: float,
    elevation_m: float | None,
) -> float:
    """
    Landslide susceptibility based on:
      - Slope steepness (dominant factor)
      - 48-hour accumulated rainfall (triggering factor)
      - Elevation context (higher elevations = more exposed)

    Weight: slope 50%, rainfall 35%, elevation 15%
    """
    # Slope: 0° → 0, 15° → 50, 30°+ → 100
    slope_score = _linear_score(slope_deg or 0, 5, 35)

    # Rainfall: 0 mm → 0, 50 mm → 50, 150+ mm → 100
    rain_score = _linear_score(rainfall_48h, 10, 150)

    # Elevation: 0 m → 0, 1000 m → 40, 3000+ m → 100
    elev_score = _linear_score(elevation_m or 0, 200, 3000)

    return round(slope_score * 0.50 + rain_score * 0.35 + elev_score * 0.15, 1)


def compute_flood_score(
    rainfall_48h: float,
    max_hourly_rate: float,
    nearest_river_m: float | None,
    elevation_m: float | None,
    slope_deg: float | None,
) -> float:
    """
    Flood risk based on:
      - Heavy rainfall accumulation + intensity
      - Proximity to river/stream
      - Low-lying, flat terrain

    Weight: rainfall 35%, intensity 15%, river proximity 30%, terrain 20%
    """
    # Cumulative rainfall
    rain_score = _linear_score(rainfall_48h, 20, 200)

    # Hourly intensity burst
    intensity_score = _linear_score(max_hourly_rate, 5, 40)

    # River proximity: closer = higher risk. 0 m → 100, 5 km → 50, 15 km+ → 0
    if nearest_river_m is not None:
        river_score = _clamp(100 - _linear_score(nearest_river_m, 0, 15_000))
    else:
        river_score = 30  # unknown → moderate default

    # Low-flat terrain: low elevation + gentle slope → high flood risk
    low_elev = _clamp(100 - _linear_score(elevation_m or 0, 0, 1500))
    flat_terrain = _clamp(100 - _linear_score(slope_deg or 0, 0, 15))
    terrain_score = (low_elev * 0.5 + flat_terrain * 0.5)

    return round(
        rain_score * 0.35
        + intensity_score * 0.15
        + river_score * 0.30
        + terrain_score * 0.20,
        1,
    )


def compute_seismic_proximity_score(
    elevation_m: float | None,
    slope_deg: float | None,
) -> float:
    """
    Seismic proximity heuristic based on terrain indicators.
    India's seismic zones correlate with Himalayan elevation and steep terrain.

    Without live seismic API, this uses elevation + slope as proxy indicators:
      - High-altitude steep terrain → Seismic Zone IV/V territory
      - Low, flat plains → Zone II/III

    Weight: elevation 60%, slope 40%
    """
    elev_score = _linear_score(elevation_m or 0, 300, 3500)
    slope_score = _linear_score(slope_deg or 0, 5, 30)

    return round(elev_score * 0.60 + slope_score * 0.40, 1)


def compute_infrastructure_score(
    hospital_count: int,
    nearest_hospital_km: float | None,
) -> float:
    """
    Infrastructure density / accessibility index.
    Higher score = BETTER infrastructure (inverse of risk).

    Based on hospital/clinic density and proximity.
    """
    # Count: 0 → 0, 1 → 30, 5+ → 80, 10+ → 100
    count_score = _linear_score(hospital_count, 0, 10)

    # Proximity: 0 km → 100, 5 km → 60, 15+ km → 0
    if nearest_hospital_km is not None:
        prox_score = _clamp(100 - _linear_score(nearest_hospital_km, 0, 15))
    else:
        prox_score = 10  # unknown → low accessibility

    return round(count_score * 0.40 + prox_score * 0.60, 1)


def compute_overall_risk(
    landslide: float,
    flood: float,
    seismic: float,
    infra: float,
) -> float:
    """
    Composite multi-hazard risk score.
    Higher infra score (= better access) reduces overall risk.

    Weights: landslide 35%, flood 30%, seismic 20%, infra penalty 15%
    """
    # Infra is "good" metric; invert it for risk contribution
    infra_risk = 100 - infra

    composite = (
        landslide * 0.35
        + flood * 0.30
        + seismic * 0.20
        + infra_risk * 0.15
    )
    return round(_clamp(composite), 1)


def determine_recommendation(overall_risk: float) -> str:
    """
    Map overall risk score to actionable recommendation.
    """
    if overall_risk >= 75:
        return "Immediate Relocation Advisory"
    elif overall_risk >= 55:
        return "Elevated Risk — Detailed Survey Required"
    elif overall_risk >= 35:
        return "Monitor — Periodic Reassessment Advised"
    else:
        return "Low Risk — Habitation Currently Viable"


def score_all(
    weather: dict,
    elevation: dict,
    osm: dict,
) -> dict:
    """
    Master scoring function. Takes raw API outputs and returns all scores.
    """
    slope = elevation.get("slope_degrees")
    elev = elevation.get("elevation_m")
    rain_48h = weather.get("accumulated_48h_rainfall_mm", 0)
    max_rate = weather.get("max_hourly_rate_mm", 0)
    nearest_river = osm.get("nearest_river_distance_m")
    hospital_count = osm.get("hospital_count", 0)
    nearest_hospital = osm.get("nearest_hospital_distance_km")

    landslide = compute_landslide_score(slope, rain_48h, elev)
    flood = compute_flood_score(rain_48h, max_rate, nearest_river, elev, slope)
    seismic = compute_seismic_proximity_score(elev, slope)
    infra = compute_infrastructure_score(hospital_count, nearest_hospital)
    overall = compute_overall_risk(landslide, flood, seismic, infra)
    recommendation = determine_recommendation(overall)

    return {
        "overall_risk": overall,
        "landslide_susceptibility": landslide,
        "flood_risk_index": flood,
        "seismic_proximity": seismic,
        "infrastructure_score": infra,
        "recommendation": recommendation,
    }
