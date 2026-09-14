import { createContext, useContext, useReducer, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

// ── State Shape ────────────────────────────────────────────
const initialState = {
  /** 'idle' | 'selecting' | 'selected' */
  selectionMode: 'idle',
  /** { lat: number, lon: number } | null */
  selectedPoint: null,
  /** { west, south, east, north } | null – derived from point + 15 km radius */
  boundingBox: null,
  /** 'idle' | 'loading' | 'complete' | 'error' */
  analysisStatus: 'idle',
  /** Full backend analysis response or null */
  analysisResult: null,
  /** Error message if analysis failed */
  analysisError: null,
  /** Currently selected habitation for triage / safe-site solving */
  selectedHabitation: null,
  /** Safe candidate site solution & evacuation arc from backend */
  safeSiteResult: null,
  /** Whether safe-site calculation is running */
  isFindingSafeSite: false,
  /** Error during safe site calculation */
  safeSiteError: null,
  /** Active Carousel Slide (0: Origin, 1: Site A, 2: Site B, 3: Allocation / Export) */
  activeSlideIndex: 0,
};

// ── Actions ────────────────────────────────────────────────
const ActionTypes = {
  START_SELECTION: 'START_SELECTION',
  SET_POINT: 'SET_POINT',
  SET_SELECTION_MODE: 'SET_SELECTION_MODE',
  RUN_ANALYSIS: 'RUN_ANALYSIS',
  ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
  RESET_SELECTION: 'RESET_SELECTION',
  SELECT_HABITATION: 'SELECT_HABITATION',
  START_FIND_SAFE_SITE: 'START_FIND_SAFE_SITE',
  SAFE_SITE_COMPLETE: 'SAFE_SITE_COMPLETE',
  SAFE_SITE_ERROR: 'SAFE_SITE_ERROR',
  CLEAR_SAFE_SITE: 'CLEAR_SAFE_SITE',
  SET_ACTIVE_SLIDE_INDEX: 'SET_ACTIVE_SLIDE_INDEX',
};

// ── Helpers ────────────────────────────────────────────────
function computeBoundingBox(lat, lon, radiusKm = 15) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lon - lonDelta,
    east: lon + lonDelta,
  };
}

// ── Reducer ────────────────────────────────────────────────
function mapReducer(state, action) {
  switch (action.type) {
    case ActionTypes.START_SELECTION:
      return {
        ...state,
        selectionMode: 'selecting',
        selectedPoint: null,
        boundingBox: null,
        analysisStatus: 'idle',
        analysisResult: null,
        analysisError: null,
        selectedHabitation: null,
        safeSiteResult: null,
        safeSiteError: null,
        activeSlideIndex: 0,
      };

    case ActionTypes.SET_POINT: {
      const { lat, lon } = action.payload;
      return {
        ...state,
        selectionMode: 'selected',
        selectedPoint: { lat, lon },
        boundingBox: computeBoundingBox(lat, lon),
        selectedHabitation: null,
        safeSiteResult: null,
        activeSlideIndex: 0,
      };
    }

    case ActionTypes.SET_SELECTION_MODE:
      return {
        ...state,
        selectionMode: action.payload,
      };

    case ActionTypes.RUN_ANALYSIS:
      return {
        ...state,
        analysisStatus: 'loading',
        analysisResult: null,
        analysisError: null,
        selectedHabitation: null,
        safeSiteResult: null,
        activeSlideIndex: 0,
      };

    case ActionTypes.ANALYSIS_COMPLETE: {
      const habitations = action.payload?.habitations || [];
      const firstCritical = habitations.find(h => h.tier === 'Critical') || habitations[0] || null;
      return {
        ...state,
        analysisStatus: 'complete',
        analysisResult: action.payload,
        selectedHabitation: firstCritical,
        safeSiteResult: null,
        activeSlideIndex: 0,
      };
    }

    case ActionTypes.ANALYSIS_ERROR:
      return {
        ...state,
        analysisStatus: 'error',
        analysisError: action.payload,
      };

    case ActionTypes.RESET_SELECTION:
      return { ...initialState };

    case ActionTypes.SELECT_HABITATION:
      return {
        ...state,
        selectedHabitation: action.payload,
        safeSiteResult: null,
        safeSiteError: null,
        activeSlideIndex: 0,
      };

    case ActionTypes.START_FIND_SAFE_SITE:
      return {
        ...state,
        isFindingSafeSite: true,
        safeSiteError: null,
      };

    case ActionTypes.SAFE_SITE_COMPLETE:
      return {
        ...state,
        isFindingSafeSite: false,
        safeSiteResult: action.payload,
        // Auto-switch to Slide 1 (Primary Safe Site A) when solution arrives
        activeSlideIndex: 1,
      };

    case ActionTypes.SAFE_SITE_ERROR:
      return {
        ...state,
        isFindingSafeSite: false,
        safeSiteError: action.payload,
      };

    case ActionTypes.CLEAR_SAFE_SITE:
      return {
        ...state,
        safeSiteResult: null,
        safeSiteError: null,
        activeSlideIndex: 0,
      };

    case ActionTypes.SET_ACTIVE_SLIDE_INDEX:
      return {
        ...state,
        activeSlideIndex:
          typeof action.payload === 'function'
            ? action.payload(state.activeSlideIndex)
            : action.payload,
      };

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────
const MapContext = createContext(null);

export function MapProvider({ children }) {
  const [state, dispatch] = useReducer(mapReducer, initialState);

  const startSelection = useCallback(() => {
    dispatch({ type: ActionTypes.START_SELECTION });
  }, []);

  const setPoint = useCallback((lat, lon) => {
    dispatch({ type: ActionTypes.SET_POINT, payload: { lat, lon } });
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!state.selectedPoint) return;
    dispatch({ type: ActionTypes.RUN_ANALYSIS });

    try {
      const resp = await fetch(`${API_BASE}/api/analyze-region`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: state.selectedPoint.lat,
          longitude: state.selectedPoint.lon,
          radius_km: 15,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      dispatch({ type: ActionTypes.ANALYSIS_COMPLETE, payload: data });
    } catch (err) {
      console.error('Analysis failed:', err);
      dispatch({
        type: ActionTypes.ANALYSIS_ERROR,
        payload: err.message || 'Failed to reach backend',
      });
    }
  }, [state.selectedPoint]);

  const selectHabitation = useCallback((habitation) => {
    dispatch({ type: ActionTypes.SELECT_HABITATION, payload: habitation });
  }, []);

  const findSafeSite = useCallback(async (habitation) => {
    const target = habitation || state.selectedHabitation;
    if (!target) return;

    dispatch({ type: ActionTypes.START_FIND_SAFE_SITE });

    try {
      const resp = await fetch(`${API_BASE}/api/find-safe-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habitation_id: target.id,
          habitation_name: target.name,
          latitude: target.latitude,
          longitude: target.longitude,
          population: target.population || 2500,
          current_hazard_score: target.hazard_score_pct || 85.0,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Safe Site API ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      dispatch({ type: ActionTypes.SAFE_SITE_COMPLETE, payload: data });
    } catch (err) {
      console.error('Find safe site failed:', err);
      dispatch({
        type: ActionTypes.SAFE_SITE_ERROR,
        payload: err.message || 'Failed to solve safe relocation site',
      });
    }
  }, [state.selectedHabitation]);

  const clearSafeSite = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_SAFE_SITE });
  }, []);

  const resetSelection = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_SELECTION });
  }, []);

  const setSelectionMode = useCallback((mode) => {
    dispatch({ type: ActionTypes.SET_SELECTION_MODE, payload: mode });
  }, []);

  const setActiveSlideIndex = useCallback((index) => {
    dispatch({ type: ActionTypes.SET_ACTIVE_SLIDE_INDEX, payload: index });
  }, []);

  return (
    <MapContext.Provider
      value={{
        ...state,
        startSelection,
        setPoint,
        setSelectionMode,
        runAnalysis,
        resetSelection,
        selectHabitation,
        findSafeSite,
        clearSafeSite,
        setActiveSlideIndex,
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMap() {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error('useMap must be used within a MapProvider');
  }
  return ctx;
}
