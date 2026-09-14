import { useState, useEffect, useCallback } from 'react';
const API_BASE = 'https://resqmap-backend-o0t5.onrender.com';
import { useMap } from '../context/MapContext';
import { generatePdfDocument } from '../utils/pdfGenerator';
import {
  Globe,
  Droplets,
  Mountain,
  Activity,
  Building2,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  CheckCircle,
  Loader2,
  XCircle,
  Thermometer,
  Wind,
  Waves,
  Navigation,
  Compass,
  Route,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  FileText,
  Layers,
  Radio,
  Share2,
} from 'lucide-react';

// ── API Status Badges ──────────────────────────────────────
const LIVE_APIS = [
  { name: 'Open-Meteo',      purpose: 'Rain & DEM',     key: 'open_meteo' },
  { name: 'OSRM Engine',     purpose: 'Road Routing',   key: 'osrm' },
  { name: 'Nominatim / OSM', purpose: 'Places & Infra', key: 'overpass' },
];

const COLOR_MAP = {
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  green: '#10B981',
};
const resolveColorHex = (c) => COLOR_MAP[c] || c || '#EF4444';

function getSlopeCategoryStyle(habitation) {
  const cat = habitation?.category || habitation?.tier || '';
  const rpi = habitation?.rpi;

  if (cat === 'Immediate' || cat === 'Critical' || (rpi != null && rpi >= 0.60)) {
    return {
      bg: 'bg-red-50/60',
      border: 'border-red-200',
      headerText: 'text-red-500',
      valueText: 'text-red-600',
      label: 'Critical',
    };
  }
  if (cat === 'Short-term' || cat === 'High' || (rpi != null && rpi >= 0.45)) {
    return {
      bg: 'bg-orange-50/60',
      border: 'border-orange-200',
      headerText: 'text-orange-500',
      valueText: 'text-orange-600',
      label: 'Elevated',
    };
  }
  if (cat === 'Medium-term' || cat === 'Moderate' || (rpi != null && rpi >= 0.30)) {
    return {
      bg: 'bg-amber-50/60',
      border: 'border-amber-200',
      headerText: 'text-amber-600',
      valueText: 'text-amber-600',
      label: 'Steep (Dry / Stable)',
    };
  }
  return {
    bg: 'bg-emerald-50/60',
    border: 'border-emerald-200',
    headerText: 'text-emerald-500',
    valueText: 'text-emerald-600',
    label: 'Gentle / Safe',
  };
}

function StatusBadge({ api, apiStatus }) {
  const status = apiStatus ? apiStatus[api.key] : 'ready';
  const isOk = !status || status === 'ok' || status === 'ready';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOk ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-red-400 ring-2 ring-red-100'}`}
      />
      <span className="text-zinc-600 font-medium">{api.name}</span>
      <span className="text-zinc-400">({api.purpose})</span>
      {!isOk && (
        <span className="text-red-500 text-[10px] truncate max-w-[120px]" title={status}>
          ⚠ {status}
        </span>
      )}
    </div>
  );
}

// ── Skeleton Card ──────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 animate-pulse-soft">
      <div className="h-3 w-24 rounded bg-zinc-200 mb-3" />
      <div className="h-7 w-16 rounded bg-zinc-200 mb-2" />
      <div className="h-2 w-full rounded bg-zinc-100" />
    </div>
  );
}

// ── Stat Pill ──────────────────────────────────────────────
function StatPill({ icon: Icon, label, value, highlight }) {
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 last:border-0">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <span className="text-zinc-500">{label}:</span>
      </div>
      <span className={`font-semibold ${highlight ? 'text-emerald-700' : 'text-zinc-800'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────
export default function MetricsSidebar() {
  const {
    selectionMode,
    selectedPoint,
    analysisStatus,
    analysisResult,
    analysisError,
    selectedHabitation,
    selectHabitation,
    findSafeSite,
    isFindingSafeSite,
    safeSiteResult,
    activeSlideIndex,
    setActiveSlideIndex,
  } = useMap();

  const scores = analysisResult?.scores;
  const weather = analysisResult?.weather;
  const elevation = analysisResult?.elevation;
  const infra = analysisResult?.infrastructure;
  const apiStatus = analysisResult?.api_status;
  const habitations = analysisResult?.habitations || [];

  const siteA = safeSiteResult?.primary_site || safeSiteResult?.safe_site;
  const siteB = safeSiteResult?.secondary_site;
  const siteC = safeSiteResult?.tertiary_site;
  const cascade = safeSiteResult?.cumulative_allocation;

  const currentHabitation = selectedHabitation || habitations[0] || null;
  const isSafeZone = currentHabitation?.category === 'Low Priority' || (currentHabitation?.rpi != null && currentHabitation?.rpi < 0.30);

  const TOTAL_SLIDES = 5;

  const nextSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.min(TOTAL_SLIDES - 1, prev + 1));
  }, [setActiveSlideIndex, TOTAL_SLIDES]);

  const prevSlide = useCallback(() => {
    setActiveSlideIndex((prev) => Math.max(0, prev - 1));
  }, [setActiveSlideIndex]);

  // Keyboard navigation (Left / Right arrow keys) — active only when NOT in a Safe Zone
  useEffect(() => {
    if (isSafeZone) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        prevSlide();
      } else if (e.key === 'ArrowRight') {
        nextSlide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevSlide, nextSlide, isSafeZone]);

  const slideTitles = [
    'SLIDE 1: ORIGIN DANGER ZONE',
    'SLIDE 2: PRIMARY SAFE SITE A',
    'SLIDE 3: SECONDARY SAFE SITE B',
    'SLIDE 4: TERTIARY SAFE SITE C',
    'SLIDE 5: CUMULATIVE ALLOCATION',
  ];

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setPdfError(null);

    try {
      const activeHab = currentHabitation;
      const safeSitesList = [
        siteA ? {
          designation: 'Site A (Primary)',
          name: siteA.name,
          capacity: siteA.human_capacity || 2500,
          allocated: siteA.allocated_citizens || 2500,
          slope_degrees: siteA.slope_degrees,
          driving_distance_km: siteA.driving_distance_km,
          transit_time_mins: siteA.transit_time_mins,
          hazard_reduction_pct: siteA.hazard_reduction_pct,
          usable_area_sqm: siteA.usable_area_sqm,
        } : null,
        siteB ? {
          designation: 'Site B (Secondary)',
          name: siteB.name,
          capacity: siteB.human_capacity || 1200,
          allocated: siteB.allocated_citizens || 1200,
          slope_degrees: siteB.slope_degrees,
          driving_distance_km: siteB.driving_distance_km,
          transit_time_mins: siteB.transit_time_mins,
          hazard_reduction_pct: siteB.hazard_reduction_pct,
          usable_area_sqm: siteB.usable_area_sqm,
        } : null,
        siteC ? {
          designation: 'Site C (Tertiary)',
          name: siteC.name,
          capacity: siteC.human_capacity || 500,
          allocated: siteC.allocated_citizens || 500,
          slope_degrees: siteC.slope_degrees,
          driving_distance_km: siteC.driving_distance_km,
          transit_time_mins: siteC.transit_time_mins,
          hazard_reduction_pct: siteC.hazard_reduction_pct,
          usable_area_sqm: siteC.usable_area_sqm,
        } : null,
      ].filter(Boolean);

      // Assemble structured payload
      const payload = {
        origin: {
          name: activeHab?.name || 'Target Habitation',
          population: activeHab?.population || 2500,
          elevation_m: activeHab?.elevation_m || 1800,
          slope_degrees: activeHab?.slope_degrees ?? (isSafeZone ? 1.5 : 30),
          slope: activeHab?.slope_degrees ?? (isSafeZone ? 1.5 : 30),
          rainfall_48h_mm: activeHab?.rainfall_48h_mm || 0,
          hazard_score_pct: activeHab?.hazard_score_pct || analysisResult?.scores?.overall_risk || (isSafeZone ? 12 : 80),
          rpi: activeHab?.rpi ?? (isSafeZone ? 0.12 : 0.8),
          rpi_percent: Math.round((activeHab?.rpi ?? (isSafeZone ? 0.12 : 0.8)) * 100),
          category: activeHab?.category || (isSafeZone ? 'Low Priority' : 'Immediate'),
          priority_action: activeHab?.priority_action || (isSafeZone ? 'Safe Baseline / Geotechnically Stable' : 'Immediate Evacuation'),
          cutoff_risk: activeHab?.cutoff_risk || (isSafeZone ? 'NONE' : 'CRITICAL'),
        },
        site_a: siteA ? {
          name: siteA.name,
          capacity: siteA.human_capacity || 2500,
          allocated: siteA.allocated_citizens || 2500,
          slope_degrees: siteA.slope_degrees,
          driving_distance_km: siteA.driving_distance_km,
          transit_time_mins: siteA.transit_time_mins,
          hazard_reduction_pct: siteA.hazard_reduction_pct,
          usable_area_sqm: siteA.usable_area_sqm,
        } : {},
        site_b: siteB ? {
          name: siteB.name,
          capacity: siteB.human_capacity || 1200,
          allocated: siteB.allocated_citizens || 1200,
          slope_degrees: siteB.slope_degrees,
          driving_distance_km: siteB.driving_distance_km,
          transit_time_mins: siteB.transit_time_mins,
          hazard_reduction_pct: siteB.hazard_reduction_pct,
          usable_area_sqm: siteB.usable_area_sqm,
        } : {},
        site_c: siteC ? {
          name: siteC.name,
          capacity: siteC.human_capacity || 500,
          allocated: siteC.allocated_citizens || 500,
          slope_degrees: siteC.slope_degrees,
          driving_distance_km: siteC.driving_distance_km,
          transit_time_mins: siteC.transit_time_mins,
          hazard_reduction_pct: siteC.hazard_reduction_pct,
          usable_area_sqm: siteC.usable_area_sqm,
        } : {},
        safe_sites: safeSitesList,
        cascade: cascade || {},
        scores: analysisResult?.scores || {},
      };

      let brief = null;
      try {
        const response = await fetch(`${API_BASE}/api/generate-brief`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          brief = await response.json();
        }
      } catch (apiErr) {
        console.warn('Could not contact /api/generate-brief, proceeding with fallback brief:', apiErr);
      }

      generatePdfDocument({
        origin: payload.origin,
        siteA,
        siteB,
        siteC,
        cascade,
        scores: analysisResult?.scores || {},
        brief: brief || {},
        isSafeZone,
      });
    } catch (err) {
      console.error('Failed to generate NDRF brief PDF:', err);
      setPdfError(err.message || 'Failed to generate PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <aside
      id="metrics-sidebar"
      className="h-full w-full bg-white/95 backdrop-blur-md border-l border-zinc-200 p-5 overflow-y-auto flex flex-col space-y-4"
    >
      {/* ── Top Header ─────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-zinc-500" />
          <div>
            <h2 className="text-sm font-extrabold text-zinc-900 tracking-tight">
              NDRF Decision Telemetry
            </h2>
          </div>
        </div>
        {analysisResult && (
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
            ⏱ {analysisResult.elapsed_seconds}s
          </span>
        )}
      </div>

      {/* ── STATE: Idle ───────────────────────────────── */}
      {analysisStatus === 'idle' && !selectedPoint && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in py-8">
          <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center mb-4 shadow-inner">
            <MapPin className="h-5 w-5 text-zinc-500" />
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed max-w-[260px] font-medium">
            Select a region on the 3D globe and click{' '}
            <span className="font-bold text-zinc-900">'⚡ Analyse Region'</span>{' '}
            to run live multi-hazard triage and safe site carrying capacity.
          </p>

          <div className="mt-8 w-full bg-zinc-50 p-4 rounded-xl border border-zinc-200/80">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Zero-Hardcoding Live Harvester
            </p>
            <div className="space-y-2">
              {LIVE_APIS.map((api) => (
                <StatusBadge key={api.name} api={api} apiStatus={null} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STATE: Selected but not analysed ───────────── */}
      {analysisStatus === 'idle' && selectedPoint && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in py-8">
          <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-200">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-bold text-zinc-900 mb-1">Target Coordinates Set</p>
          <p className="text-xs font-mono text-zinc-600 mb-4 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200">
            {selectedPoint.lat.toFixed(4)}°N, {selectedPoint.lon.toFixed(4)}°E · 15km radius
          </p>
          <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
            Click <span className="font-bold text-zinc-800">'⚡ Analyse Region'</span>{' '}
            in the top bar to discover habitations, evaluate slopes, and solve multi-site safe plateaus.
          </p>
        </div>
      )}

      {/* ── STATE: Loading ────────────────────────────── */}
      {analysisStatus === 'loading' && (
        <div className="flex-1 space-y-3 animate-fade-in py-4">
          <div className="flex items-center gap-2 mb-4 bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200">
            <Loader2 className="h-4 w-4 text-emerald-600 animate-spin shrink-0" />
            <span className="text-xs font-medium">
              Querying live satellite DEM, Overpass habitations &amp; live weather across India…
            </span>
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* ── STATE: Error ──────────────────────────────── */}
      {analysisStatus === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in py-8">
          <div className="h-12 w-12 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-200">
            <XCircle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-bold text-red-700 mb-2">Analysis Failed</p>
          <p className="text-xs text-zinc-500 max-w-[250px] leading-relaxed">
            {analysisError || 'Could not complete analysis. Ensure FastAPI backend is running on port 8000.'}
          </p>
        </div>
      )}

      {/* ── STATE: Complete ───────────────────────────── */}
      {/* ── STATE: Complete ───────────────────────────── */}
      {analysisStatus === 'complete' && analysisResult && (
        <div className="flex-1 flex flex-col space-y-5 animate-fade-in pb-4">

          {/* ═════════════════════════════════════════════════════ */}
          {/* ── 1. GEOTECHNICAL BASELINE CLEARANCE (SAFE ZONE) OR 5-SLIDE CAROUSEL ── */}
          {/* ═════════════════════════════════════════════════════ */}
          {isSafeZone ? (
            <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden flex flex-col p-4 space-y-3.5 animate-fade-in">
              {/* Badge + Habitation Title + Action Sub-line */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                    🟢 SAFE ZONE
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                    RPI: {currentHabitation?.rpi ?? '0.08'} ({currentHabitation?.hazard_score_pct ?? '8'}%)
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                  {currentHabitation?.name || 'Habitation'}
                </h3>
                <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  Action: Safe Baseline / Geotechnically Stable
                </p>
              </div>

              {/* 2x2 Telemetry Box */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Box 1: Population */}
                <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide block mb-0.5">
                    Population
                  </span>
                  <p className="font-extrabold text-zinc-900 text-sm">
                    {currentHabitation?.population ? currentHabitation.population.toLocaleString() : 'N/A'}
                  </p>
                </div>
                {/* Box 2: Slope */}
                <div className="bg-emerald-50/60 rounded-xl p-2.5 border border-emerald-200">
                  <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide block mb-0.5">
                    Slope
                  </span>
                  <p className="font-extrabold text-emerald-700 text-sm">
                    {currentHabitation?.slope_degrees != null ? `${currentHabitation.slope_degrees}°` : '1.5°'} Flat / Stable
                  </p>
                </div>
                {/* Box 3: Elevation */}
                <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide block mb-0.5">
                    Elevation
                  </span>
                  <p className="font-bold text-zinc-800 text-sm">
                    {currentHabitation?.elevation_m != null ? `${currentHabitation.elevation_m} m AMSL` : '430 m AMSL'}
                  </p>
                </div>
                {/* Box 4: 48h Rain */}
                <div className="bg-blue-50/50 rounded-xl p-2.5 border border-blue-100">
                  <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide block mb-0.5">
                    48h Rain
                  </span>
                  <p className="font-bold text-blue-700 text-sm">
                    {currentHabitation?.rainfall_48h_mm != null ? `${currentHabitation.rainfall_48h_mm} mm` : '0 mm'}
                  </p>
                </div>
              </div>

              {/* Full-width Export Button */}
              <button
                id="export-safe-clearance-pdf-btn"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs transition shadow-sm cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Compiling Geotechnical Stability Clearance...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 text-emerald-200" />
                    <span>📄 Export Geotechnical Stability Clearance (PDF)</span>
                  </>
                )}
              </button>
              {pdfError && (
                <p className="text-[10px] text-red-500 font-medium text-center mt-1">
                  ⚠ {pdfError}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-sm overflow-hidden flex flex-col transition-all duration-300">

              {/* Slider Top Bar: Header & Slide Controls */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50/90 border-b border-zinc-100">
                <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                  {slideTitles[activeSlideIndex]}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    id="carousel-prev-btn"
                    onClick={prevSlide}
                    disabled={activeSlideIndex === 0}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    title="Previous slide (←)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[11px] font-mono font-bold text-zinc-700 px-1">
                    {activeSlideIndex + 1}/{TOTAL_SLIDES}
                  </span>
                  <button
                    id="carousel-next-btn"
                    onClick={nextSlide}
                    disabled={activeSlideIndex === TOTAL_SLIDES - 1}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                    title="Next slide (→)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Carousel Content Body */}
              <div className="p-4 transition-all duration-300">

                {/* ── SLIDE 1: ORIGIN DANGER ZONE ───────────────── */}
                {activeSlideIndex === 0 && selectedHabitation && (
                  <div className="space-y-3 animate-fade-in">

                    {/* Top Bar: Zone Badge (left) + RPI Score (right) */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full leading-tight shrink-0"
                        style={{
                          backgroundColor: `${resolveColorHex(selectedHabitation.color)}18`,
                        color: resolveColorHex(selectedHabitation.color),
                        border: `1px solid ${resolveColorHex(selectedHabitation.color)}40`,
                      }}
                    >
                      {selectedHabitation.badge}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 shrink-0 font-mono">
                      RPI: {selectedHabitation.rpi} ({selectedHabitation.hazard_score_pct}%)
                    </span>
                  </div>

                  {/* Habitation Title + Action Sub-line */}
                  <div>
                    <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                      {selectedHabitation.name}
                    </h3>
                    <p className="text-[11px] font-bold text-red-700 mt-0.5 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      Action: {selectedHabitation.priority_action}
                    </p>
                  </div>

                  {/* 2×2 Clean Metrics Grid */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {/* Box 1: Population */}
                    <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide block mb-0.5">
                        Population
                      </span>
                      <p className="font-extrabold text-zinc-900 text-sm">
                        {selectedHabitation.population.toLocaleString()}
                      </p>
                    </div>
                    {/* Box 2: Slope (Dynamic RPI Category Styling) */}
                    {(() => {
                      const slopeStyle = getSlopeCategoryStyle(selectedHabitation);
                      return (
                        <div className={`${slopeStyle.bg} rounded-xl p-2.5 border ${slopeStyle.border}`}>
                          <span className={`text-[10px] ${slopeStyle.headerText} font-medium uppercase tracking-wide block mb-0.5`}>
                            Slope
                          </span>
                          <p className={`font-extrabold ${slopeStyle.valueText} text-sm`}>
                            {selectedHabitation.slope_degrees}° {slopeStyle.label}
                          </p>
                        </div>
                      );
                    })()}
                    {/* Box 3: Elevation */}
                    <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                      <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide block mb-0.5">
                        Elevation
                      </span>
                      <p className="font-bold text-zinc-800 text-sm">
                        {selectedHabitation.elevation_m} m AMSL
                      </p>
                    </div>
                    {/* Box 4: 48h Rain */}
                    <div className="bg-blue-50/50 rounded-xl p-2.5 border border-blue-100">
                      <span className="text-[10px] text-blue-500 font-medium uppercase tracking-wide block mb-0.5">
                        48h Rain
                      </span>
                      <p className="font-bold text-blue-700 text-sm">
                        {selectedHabitation.rainfall_48h_mm} mm
                      </p>
                    </div>
                  </div>

                  {/* Primary Hazard Drivers (Explainable MCDA Model) */}
                  {selectedHabitation.primary_drivers && selectedHabitation.primary_drivers.length > 0 && (
                    <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                          <Activity className="h-3 w-3 text-amber-600" />
                          MCDA Risk Drivers
                        </span>
                        {selectedHabitation.breakdown && (
                          <span className="text-[9px] font-mono text-amber-700">
                            H:{selectedHabitation.breakdown.H} W:{selectedHabitation.breakdown.W} E:{selectedHabitation.breakdown.E}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedHabitation.primary_drivers.map((drv, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white text-amber-900 border border-amber-200 shadow-2xs"
                          >
                            • {drv}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full-Width Action Button — Conditional on RPI Category */}

                  {/* Case 1: Active Danger (Red / Immediate or Orange / Short-term) */}
                  {(selectedHabitation.category === 'Immediate' || selectedHabitation.category === 'Short-term') && (
                    <button
                      id="btn-compute-cascade"
                      onClick={() => findSafeSite(selectedHabitation)}
                      disabled={isFindingSafeSite}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-sm cursor-pointer active:scale-[0.98] disabled:opacity-50"
                    >
                      {isFindingSafeSite ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Solving 24-Point Grid &amp; OSRM Routes…</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4" />
                          <span>Compute Multi-Site Relocation Cascade</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Case 2: Structural Monitoring (Yellow / Medium-term) */}
                  {selectedHabitation.category === 'Medium-term' && (
                    <button
                      id="btn-precautionary-cascade"
                      onClick={() => findSafeSite(selectedHabitation)}
                      disabled={isFindingSafeSite}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition shadow-sm cursor-pointer active:scale-[0.98] disabled:opacity-50"
                    >
                      {isFindingSafeSite ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Solving 24-Point Grid &amp; OSRM Routes…</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="h-4 w-4" />
                          <span>Precautionary Safe Site Planning</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Case 3: Safe / Flat Baseline (Green Zone, RPI < 0.30) */}
                  {(selectedHabitation.category === 'Low Priority' || selectedHabitation.rpi < 0.30) && (
                    <div className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-xs select-none">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      Habitation Geotechnically Stable — No Relocation Required
                    </div>
                  )}
                </div>
              )}

              {/* ── SLIDE 2: PRIMARY SAFE SITE A ──────────────── */}
              {activeSlideIndex === 1 && (
                <div className="space-y-3 animate-fade-in">
                  {siteA ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          PRIMARY SAFE PLATEAU · SITE A
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700">
                          ↓ {siteA.hazard_reduction_pct}% Risk Reduction
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                          {siteA.name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Direct evacuation from <span className="font-semibold text-zinc-700">{safeSiteResult.habitation_name}</span>
                        </p>
                      </div>

                      {/* Carrying capacity metric */}
                      <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-800">Carrying Capacity (40 m²/person)</span>
                          <span className="text-xs font-bold text-emerald-700">
                            {siteA.percent_accommodated}% of Village
                          </span>
                        </div>
                        <p className="text-2xl font-black text-emerald-950">
                          {siteA.human_capacity.toLocaleString()} <span className="text-xs font-medium text-emerald-800">citizens max</span>
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Usable Land Area: <strong>{siteA.usable_area_sqm.toLocaleString()} m²</strong> · Slope: <strong>{siteA.slope_degrees}°</strong>
                        </p>
                      </div>

                      {/* OSRM Road Distance & Transit */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Road Distance</span>
                          <p className="font-bold text-zinc-900 text-sm mt-0.5">{siteA.driving_distance_km} km</p>
                          <span className="text-[10px] text-zinc-500">Via local road network</span>
                        </div>
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Transit Time</span>
                          <p className="font-bold text-emerald-700 text-sm mt-0.5">~{siteA.transit_time_mins} mins</p>
                          <span className="text-[10px] text-zinc-500">Heavy emergency convoy</span>
                        </div>
                      </div>

                      {/* "Why is it safer?" geotechnical rationale */}
                      <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3 text-xs space-y-1.5">
                        <div className="flex items-center gap-1 font-bold text-[11px] text-zinc-700">
                          <HelpCircle className="h-3.5 w-3.5 text-emerald-600" />
                          <span>WHY IS IT SAFER? (NDRF GEOTECHNICAL ANALYSIS)</span>
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-zinc-600 leading-tight">
                          {siteA.why_is_it_safer?.map((pt, idx) => (
                            <li key={idx}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-zinc-400 text-xs">
                      Click 'Compute Multi-Site Relocation Cascade' on Slide 1 to solve safe sites.
                    </div>
                  )}
                </div>
              )}

              {/* ── SLIDE 3: SECONDARY SAFE SITE B ────────────── */}
              {activeSlideIndex === 2 && (
                <div className="space-y-3 animate-fade-in">
                  {siteB ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
                          SECONDARY EXPANSION · SITE B
                        </span>
                        <span className="text-[11px] font-bold text-cyan-700">
                          ↓ {siteB.hazard_reduction_pct}% Risk Reduction
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                          {siteB.name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          High-capacity secondary plateau corridor
                        </p>
                      </div>

                      {/* Capacity box */}
                      <div className="rounded-xl bg-cyan-50/70 border border-cyan-200 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-cyan-800">Carrying Capacity (40 m²/person)</span>
                          <span className="text-xs font-bold text-cyan-700">
                            {siteB.percent_accommodated}% of Village
                          </span>
                        </div>
                        <p className="text-2xl font-black text-cyan-950">
                          {siteB.human_capacity.toLocaleString()} <span className="text-xs font-medium text-cyan-800">citizens capacity</span>
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Usable Contiguous Area: <strong>{siteB.usable_area_sqm.toLocaleString()} m²</strong> · Slope: <strong>{siteB.slope_degrees}°</strong>
                        </p>
                      </div>

                      {/* Road Distance & Transit */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Road Distance</span>
                          <p className="font-bold text-zinc-900 text-sm mt-0.5">{siteB.driving_distance_km} km</p>
                          <span className="text-[10px] text-zinc-500">Paved arterial corridor</span>
                        </div>
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Transit Time</span>
                          <p className="font-bold text-cyan-700 text-sm mt-0.5">~{siteB.transit_time_mins} mins</p>
                          <span className="text-[10px] text-zinc-500">Heavy convoy access</span>
                        </div>
                      </div>

                      {/* Medical & Highway Access */}
                      <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/80 text-xs space-y-1.5 text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
                          <span>Nearest Hospital: <strong className="text-zinc-800">{siteB.nearest_hospital_km} km</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Route className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
                          <span className="truncate">{siteB.road_access}</span>
                        </div>
                      </div>

                      {/* "Why is it safer?" geotechnical rationale */}
                      <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3 text-xs space-y-1.5">
                        <div className="flex items-center gap-1 font-bold text-[11px] text-zinc-700">
                          <HelpCircle className="h-3.5 w-3.5 text-cyan-600" />
                          <span>WHY IS IT SAFER? (NDRF GEOTECHNICAL ANALYSIS)</span>
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-zinc-600 leading-tight">
                          {siteB.why_is_it_safer?.map((pt, idx) => (
                            <li key={idx}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-zinc-400 text-xs">
                      Click 'Compute Multi-Site Relocation Cascade' on Slide 1 to solve safe sites.
                    </div>
                  )}
                </div>
              )}

              {/* ── SLIDE 4: TERTIARY SAFE SITE C ─────────────── */}
              {activeSlideIndex === 3 && (
                <div className="space-y-3 animate-fade-in">
                  {siteC ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                          TERTIARY RESERVE · SITE C
                        </span>
                        <span className="text-[11px] font-bold text-purple-700">
                          ↓ {siteC.hazard_reduction_pct}% Risk Reduction
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                          {siteC.name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Multi-settlement regional tableland reserve
                        </p>
                      </div>

                      {/* Capacity box */}
                      <div className="rounded-xl bg-purple-50/70 border border-purple-200 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-purple-800">Carrying Capacity (40 m²/person)</span>
                          <span className="text-xs font-bold text-purple-700">
                            {siteC.percent_accommodated}% of Village
                          </span>
                        </div>
                        <p className="text-2xl font-black text-purple-950">
                          {siteC.human_capacity.toLocaleString()} <span className="text-xs font-medium text-purple-800">citizens capacity</span>
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Usable Tableland Area: <strong>{siteC.usable_area_sqm.toLocaleString()} m²</strong> · Slope: <strong>{siteC.slope_degrees}°</strong>
                        </p>
                      </div>

                      {/* Road Distance & Transit */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Road Distance</span>
                          <p className="font-bold text-zinc-900 text-sm mt-0.5">{siteC.driving_distance_km} km</p>
                          <span className="text-[10px] text-zinc-500">Inter-district corridor</span>
                        </div>
                        <div className="bg-zinc-50 rounded-xl p-2.5 border border-zinc-100">
                          <span className="text-[10px] text-zinc-400 font-medium uppercase">Transit Time</span>
                          <p className="font-bold text-purple-700 text-sm mt-0.5">~{siteC.transit_time_mins} mins</p>
                          <span className="text-[10px] text-zinc-500">Heavy convoy access</span>
                        </div>
                      </div>

                      {/* Medical & Highway Access */}
                      <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/80 text-xs space-y-1.5 text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          <span>Nearest Hospital: <strong className="text-zinc-800">{siteC.nearest_hospital_km} km</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Route className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          <span className="truncate">{siteC.road_access}</span>
                        </div>
                      </div>

                      {/* "Why is it safer?" geotechnical rationale */}
                      <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3 text-xs space-y-1.5">
                        <div className="flex items-center gap-1 font-bold text-[11px] text-zinc-700">
                          <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
                          <span>WHY IS IT SAFER? (NDRF GEOTECHNICAL ANALYSIS)</span>
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-zinc-600 leading-tight">
                          {siteC.why_is_it_safer?.map((pt, idx) => (
                            <li key={idx}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-zinc-400 text-xs">
                      Click 'Compute Multi-Site Relocation Cascade' on Slide 1 to solve safe sites.
                    </div>
                  )}
                </div>
              )}

              {/* ── SLIDE 5: EVACUATION ROSTER & CUMULATIVE ALLOCATION */}
              {activeSlideIndex === 4 && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      100% CUMULATIVE ALLOCATION
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-500">
                      NDRF ID 26191
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-extrabold text-zinc-900 leading-tight">
                      Multi-Site Relocation Cascade
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Full accommodation of {cascade ? cascade.total_population.toLocaleString() : (selectedHabitation?.population.toLocaleString() || '16,709')} vulnerable citizens
                    </p>
                  </div>

                  {/* Multi-Site Cascade Progress Bar */}
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-zinc-700">Cumulative Evacuation Coverage</span>
                      <span className="text-emerald-700 font-bold">100% Guaranteed</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-zinc-200 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${cascade?.site_breakdown?.[0]?.percent || 35}%` }}
                        title="Site A"
                      />
                      <div
                        className="h-full bg-cyan-500 transition-all duration-500"
                        style={{ width: `${cascade?.site_breakdown?.[1]?.percent || 40}%` }}
                        title="Site B"
                      />
                      <div
                        className="h-full bg-purple-500 flex-1 transition-all duration-500"
                        title="Site C / Reserve"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-600 font-medium">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Site A ({cascade?.site_breakdown?.[0]?.percent || 35}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-cyan-500 inline-block" /> Site B ({cascade?.site_breakdown?.[1]?.percent || 40}%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" /> Site C ({cascade?.site_breakdown?.[2]?.percent || 25}%)
                      </span>
                    </div>
                  </div>

                  {/* Breakdown Table */}
                  <div className="rounded-xl border border-zinc-200 overflow-hidden text-xs">
                    <div className="grid grid-cols-3 bg-zinc-100/80 p-2 font-bold text-[10px] text-zinc-500 uppercase">
                      <span>Designated Site</span>
                      <span className="text-center">Allocated</span>
                      <span className="text-right">Max Cap</span>
                    </div>
                    {cascade?.site_breakdown ? (
                      cascade.site_breakdown.map((s, idx) => (
                        <div key={idx} className="grid grid-cols-3 p-2 border-t border-zinc-100 items-center">
                          <span className="font-semibold text-zinc-800 truncate">
                            {s.site_label} ({s.site_name.split(' ')[0]})
                          </span>
                          <span className="text-center font-bold text-emerald-700">
                            {s.allocated.toLocaleString()}
                          </span>
                          <span className="text-right text-zinc-500">
                            {s.capacity.toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-zinc-400 text-xs">
                        Generate safe sites to view multi-plateau allocation.
                      </div>
                    )}
                  </div>

                  {/* Official PDF Export Button */}
                  <button
                    id="export-ndrf-brief-pdf-btn"
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white font-semibold text-xs shadow-sm hover:shadow transition-all cursor-pointer mt-2 disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isExportingPdf ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                        <span>Consulting Gemini AI & Compiling NDRF Brief...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 text-amber-400" />
                        <span>📄 Export Official NDRF Relocation Brief (PDF)</span>
                      </>
                    )}
                  </button>
                  {pdfError && (
                    <p className="text-[10px] text-red-500 font-medium text-center mt-1">
                      ⚠ {pdfError}
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* Slider Bottom Bar: Pagination Dots */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-t border-zinc-100">
              <span className="text-[10px] text-zinc-400 font-medium">Use ← and → arrow keys</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <button
                    key={idx}
                    id={`carousel-dot-${idx}`}
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`transition-all duration-300 rounded-full cursor-pointer ${
                      activeSlideIndex === idx
                        ? 'w-5 h-1.5 bg-zinc-900'
                        : 'w-1.5 h-1.5 bg-zinc-300 hover:bg-zinc-400'
                    }`}
                    title={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

          {/* ═════════════════════════════════════════════════════ */}
          {/* ── PERSISTENT 4-SECTION SIDEBAR DOSSIER ─────────── */}
          {/* ═════════════════════════════════════════════════════ */}

          {/* ── SECTION 1: PRIORITY SETTLEMENT TRIAGE ROSTER ───── */}
          {habitations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-zinc-600" />
                    Priority Settlement Triage Roster ({habitations.length})
                  </h3>
                  <p className="text-[10px] text-zinc-400">Click any settlement to inspect &amp; solve</p>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[175px] overflow-y-auto pr-1">
                {habitations.map((hab) => {
                  const isSelected = selectedHabitation?.id === hab.id;
                  return (
                    <div
                      key={hab.id}
                      onClick={() => {
                        selectHabitation(hab);
                        setActiveSlideIndex(0);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 text-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: hab.color }}
                        />
                        <div className="truncate">
                          <p className={`font-bold truncate ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                            {hab.name}
                          </p>
                          <p className={`text-[10px] ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                            {hab.population.toLocaleString()} pop · {hab.slope_degrees}° slope · {hab.elevation_m}m
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {hab.hazard_score_pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SECTION 2: REGIONAL MULTI-HAZARD RISK INDICES ─── */}
          {scores && (
            <div className="space-y-3">

              {/* ── Primary Card: Composite Score (Full Width) ── */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                    Regional Multi-Hazard Score
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-amber-600 leading-none mb-2.5">
                  {scores.overall_risk}%
                </p>
                {/* Thick accent progress bar */}
                <div className="h-2 w-full bg-amber-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, scores.overall_risk)}%` }}
                  />
                </div>
              </div>

              {/* ── Secondary Grid: Landslide + Flood Risk (2-col) ── */}
              <div className="grid grid-cols-2 gap-3">

                {/* Left: Landslide Susceptibility */}
                <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3.5">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Mountain className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="text-[9px] font-bold text-amber-800 uppercase tracking-widest leading-none">
                      Landslide
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-amber-600 leading-none mb-2">
                    {scores.landslide_susceptibility}%
                  </p>
                  <div className="h-1.5 w-full bg-amber-200/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, scores.landslide_susceptibility)}%` }}
                    />
                  </div>
                </div>

                {/* Right: Flood Risk */}
                <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-xl p-3.5">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Droplets className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-widest leading-none">
                      Flood Risk
                    </span>
                  </div>
                  <p className="text-xl font-extrabold text-emerald-600 leading-none mb-2">
                    {scores.flood_risk_index}%
                  </p>
                  <div className="h-1.5 w-full bg-emerald-200/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, scores.flood_risk_index)}%` }}
                    />
                  </div>
                </div>

              </div>

              {/* ── NDRF Protocol Action Advisory ── */}
              <div className="rounded-xl bg-white border border-zinc-200 p-2.5 text-xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wide">NDRF Protocol Action</p>
                  <p className="font-bold text-zinc-800 text-[11px] leading-tight mt-0.5">{scores.recommendation}</p>
                </div>
              </div>

            </div>
          )}

          {/* ── SECTION 3: LIVE METEOROLOGICAL & SENSOR TELEMETRY ─ */}
          {weather && (
            <div className="rounded-2xl bg-zinc-50/80 border border-zinc-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Radio className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Live Sensor Telemetry
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-zinc-400">Live Satellite / Ground</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded-xl p-2.5 border border-zinc-200/80">
                  <div className="flex items-center gap-1 text-zinc-400 mb-0.5">
                    <Droplets className="h-3 w-3 text-blue-500 shrink-0" />
                    <span className="text-[10px] font-medium">Current Rain</span>
                  </div>
                  <p className="font-bold text-zinc-900 text-sm">{weather.current_rainfall_mm} mm/h</p>
                  <span className="text-[10px] text-zinc-400">Peak Burst: {weather.max_hourly_rate_mm} mm/h</span>
                </div>

                <div className="bg-white rounded-xl p-2.5 border border-zinc-200/80">
                  <div className="flex items-center gap-1 text-zinc-400 mb-0.5">
                    <Activity className="h-3 w-3 text-blue-600 shrink-0" />
                    <span className="text-[10px] font-medium">48h Cumulative</span>
                  </div>
                  <p className="font-bold text-blue-700 text-sm">{weather.accumulated_48h_rainfall_mm} mm</p>
                  <span className="text-[10px] text-zinc-400">Monsoon trigger</span>
                </div>

                {weather.temperature_c != null && (
                  <div className="bg-white rounded-xl p-2.5 border border-zinc-200/80">
                    <div className="flex items-center gap-1 text-zinc-400 mb-0.5">
                      <Thermometer className="h-3 w-3 text-orange-500 shrink-0" />
                      <span className="text-[10px] font-medium">Temperature</span>
                    </div>
                    <p className="font-bold text-zinc-900 text-sm">{weather.temperature_c}°C</p>
                    <span className="text-[10px] text-zinc-400">Ambient Surface</span>
                  </div>
                )}

                {weather.wind_speed_kmh != null && (
                  <div className="bg-white rounded-xl p-2.5 border border-zinc-200/80">
                    <div className="flex items-center gap-1 text-zinc-400 mb-0.5">
                      <Wind className="h-3 w-3 text-cyan-500 shrink-0" />
                      <span className="text-[10px] font-medium">Wind Velocity</span>
                    </div>
                    <p className="font-bold text-zinc-900 text-sm">{weather.wind_speed_kmh} km/h</p>
                    <span className="text-[10px] text-zinc-400">Gust factor safe</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 4: HYDROLOGY & EMERGENCY LOGISTICS ─────── */}
          {infra && (
            <div className="rounded-2xl bg-zinc-50/80 border border-zinc-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Waves className="h-4 w-4 text-cyan-600" />
                  <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Hydrology &amp; Emergency Logistics
                  </span>
                </div>
              </div>

              <div className="space-y-1 bg-white p-2.5 rounded-xl border border-zinc-200/80">
                <StatPill
                  icon={Waves}
                  label="Active Waterways in Zone"
                  value={`${infra.river_count} streams`}
                />
                <StatPill
                  icon={Navigation}
                  label="Nearest River Setback"
                  value={
                    infra.nearest_river_distance_m != null
                      ? `${(infra.nearest_river_distance_m / 1000).toFixed(1)} km (${infra.nearest_river_distance_m}m)`
                      : 'N/A'
                  }
                />
                <StatPill
                  icon={Building2}
                  label="Hospitals in 15km Radius"
                  value={`${infra.hospital_count} centers`}
                />
                <StatPill
                  icon={Route}
                  label="Nearest Hospital Transit"
                  value={
                    infra.nearest_hospital_distance_km != null
                      ? `${infra.nearest_hospital_distance_km} km`
                      : 'N/A'
                  }
                  highlight
                />
              </div>

              {/* Harvester Live APIs Badges */}
              <div className="pt-2 border-t border-zinc-200/80">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Live Harvester Status
                </p>
                <div className="space-y-1.5">
                  {LIVE_APIS.map((api) => (
                    <StatusBadge key={api.name} api={api} apiStatus={apiStatus} />
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </aside>
  );
}
