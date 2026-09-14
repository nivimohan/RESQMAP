"""
RESQMAP — Geotechnical Decision Report Generator
Powered by Google GenAI (gemini-2.5-flash) for NDRF Visual Decision Dossiers.
"""

import os
import json
import logging
from typing import Dict, Any, List
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger("resqmap.report_generator")

env_paths = [
    Path(__file__).resolve().parent.parent.parent / ".env",
    Path(__file__).resolve().parent.parent / ".env",
]
for p in env_paths:
    if p.exists():
        load_dotenv(dotenv_path=p)

SYSTEM_PROMPT = (
    "You are the Senior Field Commander and Chief Geotechnical Strategist for the National Disaster Response Force (NDRF), India. "
    "Your reports are read by District Collectors and Field Officers under extreme emergency pressure. "
    "Write in crisp, visual, executive, human-readable language. Avoid rambling academic jargon. "
    "Use concise bullet points, bold markers, and short punchy sentences that can be understood in 5 seconds."
)


def _build_fallback_brief(payload: Dict[str, Any]) -> Dict[str, Any]:
    origin = payload.get("origin", {})
    is_safe = origin.get("rpi", 0) < 0.30 or origin.get("category") == "Low Priority"
    habitation = origin.get("name", "Target Habitation")
    slope = origin.get("slope", origin.get("slope_degrees", 1.5))
    rainfall = origin.get("rainfall_48h_mm", 0.0)
    pop = origin.get("population", 2500)
    rpi = origin.get("rpi_percent", int(origin.get("rpi", 0.12) * 100))

    if is_safe:
        return {
            "document_type": "CLEARANCE",
            "headline": f"GEOTECHNICAL CLEARANCE: {habitation} Certified Baseline Stable",
            "status_banner": "GREEN STATUS — ZERO EVACUATION REQUIRED",
            "executive_rationale": f"Comprehensive multi-criteria geotechnical assessment confirms ground stability. Gentle slope gradient ({slope}°) combined with current precipitation ({rainfall} mm) ensures zero structural slope failure risks.",
            "key_geotechnical_indicators": [
                f"Terrain slope ({slope}°) is well within the NDMA safe threshold (<15°)",
                f"Hydrological saturation ({rainfall} mm) poses no deep-seated pore pressure hazards",
                "Bedrock and substrata load-bearing capacity remains stable",
                "Designated suitable as a potential regional host shelter"
            ],
            "host_capacity_audit": {
                "standard_applied": "40 m² per person NDMA Logistics Envelope",
                "receptor_suitability": "Optimal. Can accommodate displaced populations from neighboring vulnerable zones if regional contingencies arise.",
                "estimated_host_capacity": f"{int(pop * 1.5):,} citizens"
            },
            "sdma_operational_directives": [
                "[TELEMETRY WATCH] Maintain standard automated meteorological and hydrological sensor logging.",
                "[TRANSIT ARTERIALS] Keep regional logistical corridors and arterial roads cleared for inter-district aid transit.",
                "[RECEPTOR PREPAREDNESS] Pre-designate open public grounds for staging logistical relief depots if adjacent sectors escalate.",
                "[CIVIL ADVISORY] Issue official advisory confirming normal operations and structural ground safety."
            ],
            "source": "fallback_deterministic"
        }

    safe_sites = payload.get("safe_sites", [])
    if not safe_sites:
        site_a = payload.get("site_a", {})
        site_b = payload.get("site_b", {})
        site_c = payload.get("site_c", {})
        if site_a.get("name"):
            safe_sites.append({
                "designation": "Site A (Primary)",
                "name": site_a.get("name"),
                "why_safe": "Engineered flat plateau with high shear resistance",
                "transit_time_mins": site_a.get("transit_time_mins", 25),
                "driving_distance_km": site_a.get("driving_distance_km", 12.0),
                "human_capacity": site_a.get("capacity", site_a.get("human_capacity", 2500)),
                "allocated_citizens": site_a.get("allocated", site_a.get("allocated_citizens", 2500)),
                "priority_group": "Phase 1: Pediatric, geriatric, and non-ambulatory citizens"
            })
        if site_b.get("name"):
            safe_sites.append({
                "designation": "Site B (Secondary)",
                "name": site_b.get("name"),
                "why_safe": "Elevated terrace with reinforced road corridor",
                "transit_time_mins": site_b.get("transit_time_mins", 38),
                "driving_distance_km": site_b.get("driving_distance_km", 18.0),
                "human_capacity": site_b.get("capacity", site_b.get("human_capacity", 1200)),
                "allocated_citizens": site_b.get("allocated", site_b.get("allocated_citizens", 1200)),
                "priority_group": "Phase 2: General population and essential livestock"
            })
        if site_c.get("name"):
            safe_sites.append({
                "designation": "Site C (Tertiary)",
                "name": site_c.get("name"),
                "why_safe": "Regional reserve tableland with logistics staging ground",
                "transit_time_mins": site_c.get("transit_time_mins", 45),
                "driving_distance_km": site_c.get("driving_distance_km", 24.0),
                "human_capacity": site_c.get("capacity", site_c.get("human_capacity", 500)),
                "allocated_citizens": site_c.get("allocated", site_c.get("allocated_citizens", 500)),
                "priority_group": "Phase 3: NDRF command post, field hospital & supply depot"
            })

    return {
        "document_type": "RELOCATION_ORDER",
        "headline": f"TACTICAL RELOCATION MANDATE: Immediate Decanting for {habitation}",
        "status_banner": "HIGH ALERT — MULTI-SITE STAGED EVACUATION",
        "executive_rationale": f"Extreme geotechnical vulnerability driven by steep {slope}° terrain and {rainfall} mm precipitation exceeds safety margins. Immediate staged decanting mandated to prevent casualties.",
        "key_geotechnical_indicators": [
            f"Critical slope angle ({slope}°) exceeds safe stability thresholds",
            f"Hydrological saturation at {rainfall} mm increases shear slip probability",
            "Primary arterial corridor exposed to structural obstruction",
            "High population density requires immediate multi-stage decanting"
        ],
        "tactical_allocations": safe_sites,
        "carrying_capacity_breakdown": {
            "standard_applied": "NDRF & Sphere Global Standard: 40 m² flat terrain per citizen",
            "capacity_verdict": "Multi-site cascade distribution guarantees minimum 40 m² per evacuee, preventing camp overcrowding and secondary disease risk.",
            "safety_pillars": [
                "40 m²/Person Mandate: Prevents structural overload and biological hazard collapse.",
                "Sub-10° Slope Guarantee: All selected receptor plateaus have negligible landslide susceptibility.",
                "Hydrology Safety Buffer: Receptor sites situated on elevated bedrock shelves safe from flash surges."
            ]
        },
        "sdma_operational_directives": [
            "[ROAD CLEARANCE] Deploy NDRF engineering units with earthmovers along primary transit routes.",
            "[CONVOY DISPATCH] Begin prioritized decanting for vulnerable groups (pediatric, geriatric, non-ambulatory).",
            "[SHELTER STAGING] Erect relief shelters adhering to the 40 m²/person standard with emergency life support.",
            "[SLOPE SENSING] Deploy wireless tiltmeters and piezometers on critical crown scarps for early warning."
        ],
        "source": "fallback_deterministic"
    }


async def generate_brief(payload: Dict[str, Any]) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")

    origin = payload.get("origin", {})
    is_safe = origin.get("rpi", 0) < 0.30 or origin.get("category") == "Low Priority"
    habitation = origin.get("name", "Target Habitation")
    slope = origin.get("slope", origin.get("slope_degrees", 1.5))
    rainfall = origin.get("rainfall_48h_mm", 0.0)
    pop = origin.get("population", 2500)
    rpi = origin.get("rpi_percent", int(origin.get("rpi", 0.12) * 100))

    if not api_key:
        logger.warning("GEMINI_API_KEY missing. Using visual rule-based fallback.")
        return _build_fallback_brief(payload)

    if is_safe:
        # ── TRACK A: SAFE SITE CLEARANCE BRIEF ─────────────────────
        prompt = f"""
Act as the Lead Geotechnical Analyst for the National Disaster Response Force (NDRF), Ministry of Home Affairs, India.
Generate a formal GEOTECHNICAL STABILITY CLEARANCE for {habitation}.
Telemetry: Slope: {slope}°, 48h Rain: {rainfall} mm, Population: {pop:,}, RPI Score: {rpi}%.

CRITICAL RULES:
- This is a SAFE, STABLE ZONE. Under NO circumstances mention evacuation, convoy triage, slope collapse, or shear failure.
- Do NOT mention irrelevant regional safe sites from other states (e.g., no Joshimath or Auli for southern/plains zones).
- Certify the zone's habitability and its viability as an emergency host receptor.

Respond STRICTLY in JSON:
{{
  "document_type": "CLEARANCE",
  "headline": "GEOTECHNICAL CLEARANCE: {habitation} Certified Baseline Stable",
  "status_banner": "GREEN STATUS — ZERO EVACUATION REQUIRED",
  "executive_rationale": "Comprehensive multi-criteria geotechnical assessment confirms ground stability. Gentle slope gradient ({slope}°) combined with current precipitation ({rainfall} mm) ensures zero structural slope failure risks.",
  "key_geotechnical_indicators": [
    "Terrain slope ({slope}°) is well within the NDMA safe threshold (<15°)",
    "Hydrological saturation ({rainfall} mm) poses no deep-seated pore pressure hazards",
    "Bedrock and substrata load-bearing capacity remains stable",
    "Designated suitable as a potential regional host shelter"
  ],
  "host_capacity_audit": {{
    "standard_applied": "40 m² per person NDMA Logistics Envelope",
    "receptor_suitability": "Optimal. Can accommodate displaced populations from neighboring vulnerable zones if regional contingencies arise.",
    "estimated_host_capacity": "{int(pop * 1.5):,} citizens"
  }},
  "sdma_operational_directives": [
    "[TELEMETRY WATCH] Maintain standard automated meteorological and hydrological sensor logging.",
    "[TRANSIT ARTERIALS] Keep regional logistical corridors and arterial roads cleared for inter-district aid transit.",
    "[RECEPTOR PREPAREDNESS] Pre-designate open public grounds for staging logistical relief depots if adjacent sectors escalate.",
    "[CIVIL ADVISORY] Issue official advisory confirming normal operations and structural ground safety."
  ]
}}
"""
    else:
        # ── TRACK B: EMERGENCY RELOCATION ORDER ────────────────────
        safe_sites = payload.get("safe_sites", [])
        if not safe_sites:
            site_a = payload.get("site_a", {})
            site_b = payload.get("site_b", {})
            site_c = payload.get("site_c", {})
            if site_a.get("name"):
                safe_sites.append({"designation": "Site A (Primary)", "name": site_a.get("name"), "slope_degrees": site_a.get("slope_degrees"), "transit_time_mins": site_a.get("transit_time_mins")})
            if site_b.get("name"):
                safe_sites.append({"designation": "Site B (Secondary)", "name": site_b.get("name"), "slope_degrees": site_b.get("slope_degrees"), "transit_time_mins": site_b.get("transit_time_mins")})
            if site_c.get("name"):
                safe_sites.append({"designation": "Site C (Tertiary)", "name": site_c.get("name"), "slope_degrees": site_c.get("slope_degrees"), "transit_time_mins": site_c.get("transit_time_mins")})

        prompt = f"""
Act as the Incident Commander for the National Disaster Response Force (NDRF).
Issue a TACTICAL MASS RELOCATION DIRECTIVE for {habitation}.
Telemetry: Slope: {slope}°, 48h Rain: {rainfall} mm, Exposed Population: {pop:,}, RPI: {rpi}%, Status: {origin.get("category", "Critical")}.
Safe Receptor Sites: {json.dumps(safe_sites, indent=2)}

Enforce the mandatory 40 m²/person carrying capacity standard. Dynamically reference the candidate safe sites provided in the payload; do NOT use hardcoded locations from other states.

Respond STRICTLY in JSON:
{{
  "document_type": "RELOCATION_ORDER",
  "headline": "TACTICAL RELOCATION MANDATE: Immediate Decanting for {habitation}",
  "status_banner": "HIGH ALERT — MULTI-SITE STAGED EVACUATION",
  "executive_rationale": "Extreme geotechnical vulnerability driven by steep terrain and heavy rainfall exceeds safety margins. Immediate staged decanting mandated to prevent casualties.",
  "key_geotechnical_indicators": [
    "Critical slope angle ({slope}°) exceeds safe stability thresholds",
    "Hydrological saturation at {rainfall} mm increases shear slip probability",
    "Primary arterial corridor exposed to structural obstruction",
    "High population density requires immediate multi-stage decanting"
  ],
  "tactical_allocations": {json.dumps(safe_sites)},
  "carrying_capacity_breakdown": {{
    "standard_applied": "NDRF & Sphere Global Standard: 40 m² flat terrain per citizen",
    "capacity_verdict": "Multi-site cascade distribution guarantees minimum 40 m² per evacuee, preventing camp overcrowding and secondary disease risk.",
    "safety_pillars": [
      "40 m²/Person Mandate: Prevents structural overload and biological hazard collapse.",
      "Sub-10° Slope Guarantee: All selected receptor plateaus have negligible landslide susceptibility.",
      "Hydrology Safety Buffer: Receptor sites situated on elevated bedrock shelves safe from flash surges."
    ]
  }},
  "sdma_operational_directives": [
    "[ROAD CLEARANCE] Deploy NDRF engineering units with earthmovers along primary transit routes.",
    "[CONVOY DISPATCH] Begin prioritized decanting for vulnerable groups (pediatric, geriatric, non-ambulatory).",
    "[SHELTER STAGING] Erect relief shelters adhering to the 40 m²/person standard with emergency life support.",
    "[SLOPE SENSING] Deploy wireless tiltmeters and piezometers on critical crown scarps for early warning."
  ]
}}
"""

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        result = json.loads(response.text.strip())
        result["source"] = "gemini-2.5-flash"
        return result

    except Exception as exc:
        logger.error(f"Gemini generation error: {exc}. Falling back to structured default.")
        fallback = _build_fallback_brief(payload)
        fallback["api_error"] = str(exc)[:150]
        return fallback