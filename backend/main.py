"""
RESQMAP Backend — FastAPI Application
Multi-hazard risk analysis, habitation triage, and safe site solver powered by live API data.

Run:  uvicorn main:app --port 8000
"""

import asyncio
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.weather import fetch_weather
from services.elevation import fetch_elevation_and_slope
from services.osm import fetch_hydrology_and_infra
from services.risk_engine import score_all
from services.clusters import discover_habitations
from services.safe_site_solver import solve_safe_site
from services.report_generator import generate_brief

# ── App ─────────────────────────────────────────────────────
app = FastAPI(
    title="RESQMAP API",
    description="Live multi-hazard risk analysis, red zone clustering, and safe site carrying capacity.",
    version="1.1.0",
)

# ── CORS — allow all origins for local development and testing ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ───────────────────────────────
class AnalyzeRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Center latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Center longitude")
    radius_km: float = Field(default=15.0, ge=1, le=50, description="Evaluation radius in km")


class WeatherData(BaseModel):
    current_rainfall_mm: float
    accumulated_48h_rainfall_mm: float
    max_hourly_rate_mm: float
    temperature_c: float | None = None
    wind_speed_kmh: float | None = None


class ElevationData(BaseModel):
    elevation_m: float | int | None
    slope_degrees: float | None


class InfraData(BaseModel):
    river_count: int
    nearest_river_distance_m: float | None
    hospital_count: int
    nearest_hospital_distance_km: float | None


class RiskScores(BaseModel):
    overall_risk: float
    landslide_susceptibility: float
    flood_risk_index: float
    seismic_proximity: float
    infrastructure_score: float
    recommendation: str


class Habitation(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    distance_km: float
    population: int
    elevation_m: int | float
    slope_degrees: float
    rainfall_48h_mm: float
    rpi: float
    hazard_score_pct: float
    tier: str
    color: str
    badge: str
    priority_action: str
    buffer_radius_m: float
    category: str | None = None
    color_name: str | None = None
    rpi_percent: int | None = None
    primary_drivers: list[str] | None = None
    breakdown: dict | None = None


class AnalyzeResponse(BaseModel):
    center: dict
    radius_km: float
    timestamp: str
    elapsed_seconds: float
    weather: WeatherData
    elevation: ElevationData
    infrastructure: InfraData
    scores: RiskScores
    habitations: list[Habitation]
    hazard_zones_geojson: dict
    api_status: dict


class FindSafeSiteRequest(BaseModel):
    habitation_id: str
    habitation_name: str | None = None
    latitude: float
    longitude: float
    population: int = 2500
    current_hazard_score: float = 85.0


class GenerateBriefRequest(BaseModel):
    origin: dict = Field(default_factory=dict)
    site_a: dict = Field(default_factory=dict)
    site_b: dict = Field(default_factory=dict)
    site_c: dict = Field(default_factory=dict)
    cascade: dict = Field(default_factory=dict)
    scores: dict = Field(default_factory=dict)


# ── Health Check ────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "resqmap-backend", "version": "1.1.0"}


# ── Main Analysis Endpoint ──────────────────────────────────
@app.post("/api/analyze-region", response_model=AnalyzeResponse)
async def analyze_region(req: AnalyzeRequest):
    """
    Accept a coordinate + radius, fan out to 3 live APIs concurrently,
    run habitation discovery and triage, score the results, and return unified analysis.
    """
    t0 = time.monotonic()

    api_status = {
        "open_meteo": "ok",
        "open_elevation": "ok",
        "overpass": "ok",
    }

    # ── Fan out live API calls concurrently ──────────────
    weather_task = asyncio.create_task(fetch_weather(req.latitude, req.longitude))
    elevation_task = asyncio.create_task(
        fetch_elevation_and_slope(req.latitude, req.longitude)
    )
    osm_task = asyncio.create_task(
        fetch_hydrology_and_infra(req.latitude, req.longitude, req.radius_km)
    )

    weather_data, elevation_data, osm_data = {}, {}, {}

    try:
        weather_data = await weather_task
    except Exception as e:
        api_status["open_meteo"] = f"error: {str(e)[:120]}"
        weather_data = {
            "current_rainfall_mm": 0,
            "accumulated_48h_rainfall_mm": 0,
            "max_hourly_rate_mm": 0,
            "temperature_c": None,
            "wind_speed_kmh": None,
        }

    try:
        elevation_data = await elevation_task
    except Exception as e:
        api_status["open_elevation"] = f"error: {str(e)[:120]}"
        elevation_data = {"elevation_m": None, "slope_degrees": None}

    try:
        osm_data = await osm_task
    except Exception as e:
        api_status["overpass"] = f"error: {str(e)[:120]}"
        osm_data = {
            "river_count": 0,
            "nearest_river_distance_m": None,
            "hospital_count": 0,
            "nearest_hospital_distance_km": None,
        }

    # ── Score regional metrics ───────────────────────────
    scores = score_all(weather_data, elevation_data, osm_data)

    # ── Habitation Discovery & Triage ────────────────────
    habitations, hazard_zones_geojson = await discover_habitations(
        lat=req.latitude,
        lon=req.longitude,
        radius_km=req.radius_km,
        weather_data=weather_data,
        osm_data=osm_data,
    )

    elapsed = round(time.monotonic() - t0, 2)

    return AnalyzeResponse(
        center={"lat": req.latitude, "lon": req.longitude},
        radius_km=req.radius_km,
        timestamp=datetime.now(timezone.utc).isoformat(),
        elapsed_seconds=elapsed,
        weather=WeatherData(**weather_data),
        elevation=ElevationData(**elevation_data),
        infrastructure=InfraData(**osm_data),
        scores=RiskScores(**scores),
        habitations=[Habitation(**h) for h in habitations],
        hazard_zones_geojson=hazard_zones_geojson,
        api_status=api_status,
    )


# ── Safe Candidate Relocation Site Endpoint ──────────────────
@app.post("/api/find-safe-site")
async def find_safe_site(req: FindSafeSiteRequest):
    """
    Given a high-risk habitation, calculates optimal safe plateau within 5-25km,
    carrying capacity (40 sq.m/person), transit metrics, and 3D evacuation arc coordinates.
    """
    try:
        site_solution = await solve_safe_site(
            habitation_id=req.habitation_id,
            habitation_name=req.habitation_name or f"Settlement {req.habitation_id}",
            lat=req.latitude,
            lon=req.longitude,
            population=req.population,
            current_hazard_score=req.current_hazard_score,
        )
        return site_solution
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Safe site solver error: {str(e)}")


# ── Official NDRF AI Relocation Brief Endpoint ───────────────
@app.post("/api/generate-brief")
async def create_ndrf_brief(req: GenerateBriefRequest):
    """
    Generates an authoritative NDRF disaster relocation decision report powered by
    Gemini 2.5 Flash with carrying capacity justifications and operational protocols.
    """
    try:
        brief = await generate_brief(req.model_dump())
        return brief
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Brief generation error: {str(e)}")
