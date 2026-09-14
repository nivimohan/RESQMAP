import { useMap } from '../context/MapContext';
import {
  MapPin,
  Zap,
  RotateCcw,
  Mountain,
  ChevronRight,
} from 'lucide-react';

const PRESETS = [
  { label: 'Uttarakhand', sub: 'Joshimath / Chamoli', lat: 30.5574, lon: 79.5591 },
  { label: 'Kerala', sub: 'Wayanad', lat: 11.6854, lon: 76.1320 },
  { label: 'Himachal', sub: 'Shimla', lat: 31.1048, lon: 77.1734 },
];

export default function Navbar() {
  const {
    selectionMode,
    selectedPoint,
    analysisStatus,
    startSelection,
    runAnalysis,
    resetSelection,
    setPoint,
  } = useMap();

  const isSelecting = selectionMode === 'selecting';
  const isSelected  = selectionMode === 'selected';
  const canAnalyse  = isSelected && analysisStatus !== 'loading';

  return (
    <nav
      id="navbar"
      className="relative z-50 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-2.5 shadow-xs"
    >
      {/* ── Brand & Preset District Pills ────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <h1 className="text-lg font-black tracking-tight text-zinc-900 leading-none">
            RESQMAP
          </h1>
          <span className="hidden sm:inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-zinc-600 uppercase border border-zinc-200/80">
            NDRF Decision Support System
          </span>
        </div>

        <div className="h-5 w-px bg-zinc-200 hidden md:block" />

        <div className="flex items-center gap-1.5 shrink-0">
          {PRESETS.map((p) => {
            const isActive =
              selectedPoint &&
              Math.abs(p.lat - selectedPoint.lat) < 0.001 &&
              Math.abs(p.lon - selectedPoint.lon) < 0.001;

            return (
              <button
                key={p.label}
                id={`preset-${p.label.toLowerCase()}`}
                onClick={() => setPoint(p.lat, p.lon)}
                className={`group flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-[0.97] cursor-pointer ${
                  isActive
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                <Mountain className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-600' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
                <span className="font-semibold">{p.label}</span>
                <span className="text-zinc-400 font-normal hidden xl:inline">({p.sub})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {isSelected && (
          <button
            id="btn-reselect"
            onClick={() => {
              resetSelection();
              startSelection();
            }}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:border-zinc-300 active:scale-[0.97] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-select Area
          </button>
        )}

        <button
          id="btn-select-area"
          onClick={startSelection}
          disabled={isSelecting}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.97] cursor-pointer ${
            isSelecting
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default ring-2 ring-emerald-400/20'
              : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 hover:border-zinc-400'
          }`}
        >
          <MapPin className={`h-3.5 w-3.5 text-emerald-600 ${isSelecting ? 'animate-bounce' : ''}`} />
          {isSelecting ? '🎯 Click on Globe…' : 'Select Area on Map'}
        </button>

        <button
          id="btn-analyse"
          onClick={runAnalysis}
          disabled={!canAnalyse}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
            canAnalyse
              ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm cursor-pointer'
              : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
          }`}
        >
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          Analyse Region
          {canAnalyse && <ChevronRight className="h-3 w-3 ml-0.5 opacity-60" />}
        </button>
      </div>
    </nav>
  );
}