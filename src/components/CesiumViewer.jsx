import { useEffect, useRef, useCallback, useState } from 'react';
import * as Cesium from 'cesium';
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
import { useMap } from '../context/MapContext';
import { Compass, Search, X } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────
const DEFAULT_CENTER = { lat: 22.0, lon: 82.0 };
const DEFAULT_HEIGHT = 3_500_000;
const RADIUS_KM = 15;
const RADIUS_M  = RADIUS_KM * 1000;

// Preset fly-to altitude for district buttons
const PRESET_FLY_HEIGHT = 35_000;

// CartoDB Voyager labels-only overlay
const LABEL_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png';

// Re-enables full interactive camera control after any flight or lookAt lock.
// Must be called in every flyTo `complete` callback and after any camera.lookAt().
const unlockCamera = (viewer) => {
  if (!viewer || viewer.isDestroyed()) return;
  // Ensure no tracked entity is locking camera orientation or position
  viewer.trackedEntity = undefined;
  // Release any lookAt() transform lock
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  const ctrl = viewer.scene.screenSpaceCameraController;
  ctrl.enableRotate    = true;
  ctrl.enableTranslate = true;
  ctrl.enableZoom      = true;
  ctrl.enableTilt      = true;
  ctrl.enableLook      = true;
  ctrl.minimumZoomDistance = 50.0;
  ctrl.maximumZoomDistance = 25_000_000.0;
};

export default function CesiumViewer() {
  const viewerRef     = useRef(null);
  const containerRef  = useRef(null);
  const entitiesRef   = useRef([]); // base selection entities
  const zoneEntitiesRef = useRef([]); // red zone clamped polygons + village pins
  const arcEntitiesRef  = useRef([]); // evacuation arc + safe site pin
  const clickPickerRef = useRef(null);
  const prevPointRef  = useRef(null);
  // Flag: true when the search event handler already called drawSelection,
  // so the subsequent selectedPoint useEffect can skip the redundant second call.
  const searchHandledRef = useRef(false);

  // Permanent Static HUD state
  const [hudCoords, setHudCoords] = useState({
    lat: DEFAULT_CENTER.lat,
    lon: DEFAULT_CENTER.lon,
    elevation: null,
  });

  // Floating coordinate box state for crosshair reticle
  const [floatingTooltip, setFloatingTooltip] = useState(null);

  const {
    selectionMode,
    selectedPoint,
    setPoint,
    setSelectionMode,
    analysisResult,
    selectedHabitation,
    selectHabitation,
    safeSiteResult,
  } = useMap();

  // ── Floating map search box state ──────────────────────
  const [mapSearchQuery, setMapSearchQuery]   = useState('');
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchError, setMapSearchError]   = useState(null);
  const mapSearchInputRef = useRef(null);

  // Coord parser: "11.0194, 76.9672" or "11.0194 76.9672"
  const parseMapCoords = (raw) => {
    const cleaned = raw.trim().replace(/[°NEne]/g, '');
    const parts = cleaned.split(/[,\s]+/).map(Number).filter((n) => !isNaN(n));
    if (parts.length === 2) {
      const [lat, lon] = parts;
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
    }
    return null;
  };

  // Geocode + pin handler for the floating map search box
  const handleMapSearch = async () => {
    const raw = mapSearchQuery.trim();
    if (!raw) return;
    setMapSearchLoading(true);
    setMapSearchError(null);
    try {
      // 1. Direct coordinate parse (instant, no network)
      const coords = parseMapCoords(raw);
      if (coords) {
        setPoint(coords.lat, coords.lon);
        setSelectionMode('selected');
        window.dispatchEvent(new CustomEvent('resqmap:search-point', {
          detail: { lat: coords.lat, lon: coords.lon, label: raw },
        }));
        setMapSearchLoading(false);
        return;
      }
      // 2. Open-Meteo geocoding API (place names)
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(raw)}&count=1&language=en&format=json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Geocoding service unavailable');
      const data = await resp.json();
      const result = data?.results?.[0];
      if (!result) throw new Error(`No results for "${raw}"`);
      setPoint(result.latitude, result.longitude);
      setSelectionMode('selected');
      window.dispatchEvent(new CustomEvent('resqmap:search-point', {
        detail: { lat: result.latitude, lon: result.longitude, label: result.name || raw },
      }));
      setMapSearchLoading(false);
    } catch (err) {
      setMapSearchError(err.message || 'Location not found');
      setMapSearchLoading(false);
    }
  };

  const selectedPointRef = useRef(selectedPoint);
  useEffect(() => {
    selectedPointRef.current = selectedPoint;
  }, [selectedPoint]);

  // ── Initialise Viewer ──────────────────────────────────
  useEffect(() => {
    if (viewerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

    const viewer = new Cesium.Viewer(containerRef.current, {
  baseLayer: new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/'
    })
  ),
  geocoder: false,
  timeline: false,
  animation: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  homeButton: false,
  sceneModePicker: false,
  fullscreenButton: false,
});

    viewer.scene.globe.enableLighting = true;

    const controller = viewer.scene.screenSpaceCameraController;
    // Spec zoom bounds — wider than default to allow natural close-in zoom
    controller.minimumZoomDistance = 50.0;
    controller.maximumZoomDistance = 25_000_000.0;
    // Explicitly unlock all five input axes so they can never start disabled
    controller.enableRotate    = true;
    controller.enableTranslate = true;
    controller.enableZoom      = true;
    controller.enableTilt      = true;
    controller.enableLook      = true;

    const labelProvider = new Cesium.UrlTemplateImageryProvider({
      url: LABEL_TILE_URL,
      subdomains: ['a', 'b', 'c', 'd'],
      minimumLevel: 0,
      maximumLevel: 20,
      credit: 'CartoDB',
    });
    viewer.imageryLayers.addImageryProvider(labelProvider);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        DEFAULT_CENTER.lon,
        DEFAULT_CENTER.lat,
        DEFAULT_HEIGHT
      ),
    });

    // ── Static HUD updates on Camera Move ─────────────────
    const sampleCameraCenter = () => {
      if (!viewer || viewer.isDestroyed()) return;
      // Do not overwrite HUD if a target anchor point is actively selected/pinned
      if (selectedPointRef.current) return;

      const width = viewer.canvas?.clientWidth || 800;
      const height = viewer.canvas?.clientHeight || 600;
      const centerRay = viewer.camera.getPickRay(new Cesium.Cartesian2(width / 2, height / 2));
      if (!centerRay) return;

      const cartesian = viewer.scene.globe.pick(centerRay, viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const terrainHeight = viewer.scene.globe.getHeight(carto);
      const elevation = terrainHeight != null ? Math.round(terrainHeight) : null;

      setHudCoords({
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        elevation,
      });
    };

    viewer.camera.moveEnd.addEventListener(sampleCameraCenter);
    viewerRef.current = viewer;

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.camera.moveEnd.removeEventListener(sampleCameraCenter);
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Update HUD and floating search box when selected point changes
  useEffect(() => {
    if (selectedPoint) {
      const viewer = viewerRef.current;
      let elevation = null;
      if (viewer && !viewer.isDestroyed()) {
        const carto = Cesium.Cartographic.fromDegrees(selectedPoint.lon, selectedPoint.lat);
        const terrainH = viewer.scene.globe.getHeight(carto);
        if (terrainH != null) elevation = Math.round(terrainH);
      }
      setHudCoords(prev => ({
        lat: Number(selectedPoint.lat.toFixed(4)),
        lon: Number(selectedPoint.lon.toFixed(4)),
        elevation: elevation ?? prev.elevation,
      }));
      // Requirement 4: sync the floating search box text to the active coordinate
      // (covers preset clicks, globe clicks, and Navbar search)
      setMapSearchQuery(`${Number(selectedPoint.lat.toFixed(4))}, ${Number(selectedPoint.lon.toFixed(4))}`);
      setMapSearchError(null);
    }
  }, [selectedPoint]);

  // ── Clear base entities ────────────────────────────────
  const clearBaseEntities = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    entitiesRef.current.forEach((e) => viewer.entities.remove(e));
    entitiesRef.current = [];
  }, []);

  // ── Clear zone entities ────────────────────────────────
  const clearZoneEntities = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    zoneEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    zoneEntitiesRef.current = [];
  }, []);

  // ── Clear arc entities ─────────────────────────────────
  const clearArcEntities = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    arcEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    arcEntitiesRef.current = [];
  }, []);

  // ── Draw base pin + selection circle ───────────────────
  const drawSelection = useCallback(
    (lat, lon, flyHeight = 45_000) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      clearBaseEntities();
      clearZoneEntities();
      clearArcEntities();

      // Remove any existing search pin before drawing a new one
      const existingPin = viewer.entities.getById('search_anchor_pin');
      if (existingPin) {
        viewer.entities.remove(existingPin);
      }
      const existingEval = viewer.entities.getById('search_anchor_eval_radius');
      if (existingEval) {
        viewer.entities.remove(existingEval);
      }

      // Sample terrain elevation for HUD at exact point
      const carto = Cesium.Cartographic.fromDegrees(lon, lat);
      const terrainHeight = viewer.scene.globe.getHeight(carto);
      const elevation = terrainHeight != null ? Math.round(terrainHeight) : null;
      setHudCoords({
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        elevation,
      });

      const evalRadiusMeters = RADIUS_M; // 15 km evaluation boundary

      // 1. Target Anchor Pin (ID: 'search_anchor_pin') — electric-blue spec
      const anchorPin = viewer.entities.add({
        id: 'search_anchor_pin',
        name: 'search_anchor_pin',
        position: Cesium.Cartesian3.fromDegrees(lon, lat, elevation || 0),
        point: {
          pixelSize: 14,
          color: Cesium.Color.fromCssColorString('#0284c7'), // Vibrant electric blue
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always visible through terrain
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        billboard: {
          image: buildPinSvg('#0284c7'),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: 0.85,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          pixelOffset: new Cesium.Cartesian2(0, 0),
        },
        ellipse: {
          semiMajorAxis: 250.0,
          semiMinorAxis: 250.0,
          material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#0284c7'),
          outlineWidth: 2,
          classificationType: Cesium.ClassificationType.TERRAIN,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `TARGET: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
          font: '12px monospace',
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          backgroundColor: Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.85),
          showBackground: true,
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          pixelOffset: new Cesium.Cartesian2(0, -32),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      // 2. Static 15 km Evaluation Outer Radius Circle
      const evalCircle = viewer.entities.add({
        id: 'search_anchor_eval_radius',
        name: 'search_anchor_eval_radius',
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: evalRadiusMeters,
          semiMinorAxis: evalRadiusMeters,
          material: Cesium.Color.CYAN.withAlpha(0.05),
          outline: true,
          outlineColor: Cesium.Color.CYAN.withAlpha(0.35),
          outlineWidth: 1.5,
          classificationType: Cesium.ClassificationType.TERRAIN,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      entitiesRef.current = [anchorPin, evalCircle];

      // Explicitly release any entity tracking or lookAt transform lock so camera is completely free
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      const ctrl = viewer.scene.screenSpaceCameraController;
      ctrl.enableTranslate = true;
      ctrl.enableRotate = true;
      ctrl.enableTilt = true;
      ctrl.enableZoom = true;
      ctrl.enableLook = true;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.12, flyHeight),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.8,
        complete: () => unlockCamera(viewer),
      });
    },
    [clearBaseEntities, clearZoneEntities, clearArcEntities]
  );

  // ── Render 3D Terrain-Clamped Hazard Zones & Habitations ─
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !analysisResult) return;

    clearZoneEntities();
    const habitations = analysisResult.habitations || [];
    const geojson = analysisResult.hazard_zones_geojson;
    const newEntities = [];

    // 1. Render Terrain-Clamped Hazard Zone Polygons
    if (geojson?.features) {
      geojson.features.forEach((feature) => {
        const props = feature.properties || {};
        const geom = feature.geometry;
        if (geom?.type === 'Polygon' && geom.coordinates?.[0]) {
          const flatCoords = [];
          geom.coordinates[0].forEach(([pLon, pLat]) => {
            flatCoords.push(pLon, pLat);
          });

          const zoneColorHex = getCategoryColor(props);
          const zoneColor = Cesium.Color.fromCssColorString(zoneColorHex);

          const polyEntity = viewer.entities.add({
            name: `Zone_${props.id}`,
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
              material: zoneColor.withAlpha(0.42),
              classificationType: Cesium.ClassificationType.TERRAIN, // 3D drape over terrain
              outline: true,
              outlineColor: zoneColor.withAlpha(0.9),
              outlineWidth: 2,
            },
          });
          newEntities.push(polyEntity);
        }
      });
    }

    // 2. Render Interactive Settlement Billboard Pins (Clamped to Ground)
    habitations.forEach((hab) => {
      const isSelected = selectedHabitation?.id === hab.id;
      const categoryColor = getCategoryColor(hab);
      const badgeText = getDynamicBadge(hab);

      const villagePin = viewer.entities.add({
        id: `village_${hab.id}`,
        name: hab.name,
        position: Cesium.Cartesian3.fromDegrees(hab.longitude, hab.latitude),
        properties: new Cesium.PropertyBag({
          habitationData: hab,
        }),
        billboard: {
          image: buildPinSvg(categoryColor),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: isSelected ? 0.95 : 0.72,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${hab.name}\n${badgeText} · ${hab.population ? hab.population.toLocaleString() : 'N/A'} pop`,
          font: isSelected ? 'bold 12px Inter, sans-serif' : 'bold 11px Inter, sans-serif',
          fillColor: Cesium.Color.fromCssColorString(categoryColor),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -42),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      newEntities.push(villagePin);
    });

    zoneEntitiesRef.current = newEntities;
  }, [analysisResult, selectedHabitation, clearZoneEntities]);

  // ── Render 3D Evacuation Arc & Safe Site Plateau Polygon ─
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    clearArcEntities();
    if (!safeSiteResult) return;

    const newArcEntities = [];

    // 1. Primary Safe Site (Site A) Pin & Plateau
    const siteA = safeSiteResult.primary_site || safeSiteResult.safe_site;
    const safePinA = viewer.entities.add({
      id: 'safe_site_pin_a',
      position: Cesium.Cartesian3.fromDegrees(siteA.longitude, siteA.latitude),
      billboard: {
        image: buildPinSvg('#10B981'),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scale: 0.9,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `🟢 PRIMARY SAFE PLATEAU (SITE A)\n${siteA.name}\nCap: ${siteA.human_capacity.toLocaleString()} citizens · ${siteA.slope_degrees}° slope`,
        font: 'bold 12px Inter, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#065f46'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -44),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Plateau polygon A
    if (siteA.plateau_polygon && siteA.plateau_polygon.length > 2) {
      const flatCoords = [];
      siteA.plateau_polygon.forEach(([pLon, pLat]) => flatCoords.push(pLon, pLat));
      const safePolyA = viewer.entities.add({
        name: 'Safe_Site_Plateau_A',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
          material: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.38),
          classificationType: Cesium.ClassificationType.TERRAIN,
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#059669'),
          outlineWidth: 3,
        },
      });
      newArcEntities.push(safePolyA);
    }
    newArcEntities.push(safePinA);

    // 2. Secondary Safe Site (Site B) Pin & Plateau
    const siteB = safeSiteResult.secondary_site;
    if (siteB) {
      const safePinB = viewer.entities.add({
        id: 'safe_site_pin_b',
        position: Cesium.Cartesian3.fromDegrees(siteB.longitude, siteB.latitude),
        billboard: {
          image: buildPinSvg('#06B6D4'),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: 0.85,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `🔵 SECONDARY SAFE SITE (SITE B)\n${siteB.name}\nCap: ${siteB.human_capacity.toLocaleString()} citizens · ${siteB.slope_degrees}° slope`,
          font: 'bold 11px Inter, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#0e7490'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -44),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      if (siteB.plateau_polygon && siteB.plateau_polygon.length > 2) {
        const flatCoordsB = [];
        siteB.plateau_polygon.forEach(([pLon, pLat]) => flatCoordsB.push(pLon, pLat));
        const safePolyB = viewer.entities.add({
          name: 'Safe_Site_Plateau_B',
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoordsB),
            material: Cesium.Color.fromCssColorString('#06B6D4').withAlpha(0.32),
            classificationType: Cesium.ClassificationType.TERRAIN,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#0891b2'),
            outlineWidth: 2,
          },
        });
        newArcEntities.push(safePolyB);
      }
      newArcEntities.push(safePinB);
    }

    // 3. Tertiary Safe Site (Site C) Pin & Plateau
    const siteC = safeSiteResult.tertiary_site;
    if (siteC) {
      const safePinC = viewer.entities.add({
        id: 'safe_site_pin_c',
        position: Cesium.Cartesian3.fromDegrees(siteC.longitude, siteC.latitude),
        billboard: {
          image: buildPinSvg('#8B5CF6'),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: 0.85,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `🟣 TERTIARY SAFE SITE (SITE C)\n${siteC.name}\nCap: ${siteC.human_capacity.toLocaleString()} citizens · ${siteC.slope_degrees}° slope`,
          font: 'bold 11px Inter, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#6d28d9'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -44),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      if (siteC.plateau_polygon && siteC.plateau_polygon.length > 2) {
        const flatCoordsC = [];
        siteC.plateau_polygon.forEach(([pLon, pLat]) => flatCoordsC.push(pLon, pLat));
        const safePolyC = viewer.entities.add({
          name: 'Safe_Site_Plateau_C',
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoordsC),
            material: Cesium.Color.fromCssColorString('#8B5CF6').withAlpha(0.32),
            classificationType: Cesium.ClassificationType.TERRAIN,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#7C3AED'),
            outlineWidth: 2,
          },
        });
        newArcEntities.push(safePolyC);
      }
      newArcEntities.push(safePinC);
    }

    // 4. Multi-Corridor 3D Evacuation Arcs (Sites A, B, and C)
    const arcs = safeSiteResult.evacuation_arcs || (safeSiteResult.evacuation_arc ? [safeSiteResult.evacuation_arc] : []);
    arcs.forEach((arc) => {
      if (arc?.points?.length > 1) {
        const cartesianPoints = arc.points.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.height)
        );
        const arcPolyline = viewer.entities.add({
          polyline: {
            positions: cartesianPoints,
            width: arc.width || 6,
            clampToGround: false,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: arc.glow_power || 0.35,
              taperPower: 0.85,
              color: Cesium.Color.fromCssColorString(arc.color || '#10B981'),
            }),
          },
        });
        newArcEntities.push(arcPolyline);
      }
    });

    arcEntitiesRef.current = newArcEntities;
  }, [safeSiteResult, clearArcEntities]);

  // ── Camera Glide Synchronized with Active Carousel Slide ─
  const { activeSlideIndex } = useMap();
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !safeSiteResult) return;

    const dangerLat = safeSiteResult.danger_coordinates?.latitude || selectedPoint?.lat;
    const dangerLon = safeSiteResult.danger_coordinates?.longitude || selectedPoint?.lon;
    const siteA = safeSiteResult.primary_site || safeSiteResult.safe_site;
    const siteB = safeSiteResult.secondary_site;
    const siteC = safeSiteResult.tertiary_site;

    if (activeSlideIndex === 0 && dangerLat != null && dangerLon != null) {
      // Focus on Origin Danger Zone
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(dangerLon, dangerLat - 0.07, 18000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
        complete: () => unlockCamera(viewer),
      });
    } else if (activeSlideIndex === 1 && siteA) {
      // Focus on Site A (Primary Safe Site)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(siteA.longitude, siteA.latitude - 0.06, 16000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
        complete: () => unlockCamera(viewer),
      });
    } else if (activeSlideIndex === 2 && siteB) {
      // Focus on Site B (Secondary Safe Site)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(siteB.longitude, siteB.latitude - 0.07, 18000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
        complete: () => unlockCamera(viewer),
      });
    } else if (activeSlideIndex === 3 && siteC) {
      // Focus on Site C (Tertiary Safe Site)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(siteC.longitude, siteC.latitude - 0.07, 18000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
        complete: () => unlockCamera(viewer),
      });
    } else if (activeSlideIndex === 4) {
      // High-Altitude Multi-Corridor Overview encompassing all 3 sites and arcs
      const allLats = [dangerLat, siteA?.latitude, siteB?.latitude, siteC?.latitude].filter((v) => v != null);
      const allLons = [dangerLon, siteA?.longitude, siteB?.longitude, siteC?.longitude].filter((v) => v != null);
      const centerLat = allLats.length > 0 ? (Math.min(...allLats) + Math.max(...allLats)) / 2.0 : (dangerLat || 22.0);
      const centerLon = allLons.length > 0 ? (Math.min(...allLons) + Math.max(...allLons)) / 2.0 : (dangerLon || 82.0);

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.14, 42000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-50),
          roll: 0,
        },
        duration: 1.8,
        complete: () => unlockCamera(viewer),
      });
    }
  }, [activeSlideIndex, safeSiteResult, selectedPoint]);

  // ── Mouse Move Handler for Interactive Crosshair Reticle ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (selectionMode !== 'selecting') {
      setFloatingTooltip(null);
      return;
    }

    const moveHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    moveHandler.setInputAction((movement) => {
      if (!movement.endPosition) return;

      const ray = viewer.camera.getPickRay
        ? viewer.camera.getPickRay(movement.endPosition)
        : viewer.camera.getRay(movement.endPosition);
      if (!ray) {
        setFloatingTooltip(null);
        return;
      }

      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) {
        setFloatingTooltip(null);
        return;
      }

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const height = carto.height || 0;

      const containerWidth = containerRef.current?.clientWidth || viewer.canvas?.clientWidth || 800;
      const containerHeight = containerRef.current?.clientHeight || viewer.canvas?.clientHeight || 600;

      const rawX = movement.endPosition.x;
      const rawY = movement.endPosition.y;

      const TOOLTIP_WIDTH = 265;
      const TOOLTIP_HEIGHT = 34;

      // Horizontal flip: If placing to the right overflows container boundary, flip to left
      let posX = rawX + 15;
      if (posX + TOOLTIP_WIDTH > containerWidth - 12) {
        posX = rawX - TOOLTIP_WIDTH - 15;
      }
      posX = Math.max(10, Math.min(posX, containerWidth - TOOLTIP_WIDTH - 10));

      // Vertical flip: If placing above overflows top boundary, flip below cursor
      let posY = rawY - 25;
      if (posY < 10) {
        posY = rawY + 20;
      } else if (posY + TOOLTIP_HEIGHT > containerHeight - 10) {
        posY = rawY - TOOLTIP_HEIGHT - 10;
      }
      posY = Math.max(10, Math.min(posY, containerHeight - TOOLTIP_HEIGHT - 10));

      setFloatingTooltip({
        x: posX,
        y: posY,
        lat,
        lon,
        height,
      });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      moveHandler.destroy();
    };
  }, [selectionMode]);

  // ── Click Picking for Village Selection & Precision Globe Pick ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    clickHandler.setInputAction((click) => {
      // 1. Check if user clicked an entity
      const pickedObject = viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject)) {
        // Habitation pin click
        if (pickedObject.id?.properties?.hasProperty('habitationData')) {
          const hab = pickedObject.id.properties.getValue().habitationData;
          if (hab) {
            selectHabitation(hab);
            return;
          }
        }
        // Clicking the existing Target Anchor Pin locks it
        if (selectionMode === 'selecting' && (pickedObject.id?.id === 'search_anchor_pin' || pickedObject.id?.name === 'search_anchor_pin')) {
          const cartesian = pickedObject.id.position?.getValue(Cesium.JulianDate.now());
          if (cartesian) {
            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            const height = carto.height || 0;

            setHudCoords({
              lat: Number(lat.toFixed(4)),
              lon: Number(lon.toFixed(4)),
              elevation: Math.round(height),
            });
            setFloatingTooltip(null);
            setPoint(lat, lon);
            return;
          }
        }
      }

      // 2. If in selecting mode, precision pick coordinate on 3D terrain
      if (selectionMode === 'selecting') {
        const ray = viewer.camera.getPickRay
          ? viewer.camera.getPickRay(click.position)
          : viewer.camera.getRay(click.position);
        if (!ray) return;

        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!cartesian) return;

        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const height = carto.height || 0;

        setHudCoords({
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4)),
          elevation: Math.round(height),
        });
        setFloatingTooltip(null);
        setPoint(lat, lon);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    clickPickerRef.current = clickHandler;

    return () => {
      if (clickPickerRef.current) {
        clickPickerRef.current.destroy();
        clickPickerRef.current = null;
      }
    };
  }, [selectionMode, setPoint, selectHabitation]);

  // ── React to point changes ─────────────────────────────
  useEffect(() => {
    if (!selectedPoint) {
      prevPointRef.current = null;
      return;
    }

    // If the search event handler already called drawSelection synchronously,
    // skip this duplicate re-render-triggered call to avoid double fly + pin flash.
    if (searchHandledRef.current) {
      searchHandledRef.current = false;
      prevPointRef.current = selectedPoint;
      return;
    }

    drawSelection(selectedPoint.lat, selectedPoint.lon, PRESET_FLY_HEIGHT);
    prevPointRef.current = selectedPoint;
  }, [selectedPoint, drawSelection]);

  // ── React to search-box submissions instantly (pre-React-render) ──
  // The Navbar dispatches 'resqmap:search-point' synchronously after setPoint(),
  // so CesiumViewer can fly + pin without waiting for the React re-render cycle.
  const SEARCH_FLY_HEIGHT = 8_000; // Tighter zoom for searched places vs. district presets
  useEffect(() => {
    const handleSearchEvent = (e) => {
      const { lat, lon, label } = e.detail;
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      // Mark handled so the selectedPoint useEffect skips its redundant call
      searchHandledRef.current = true;

      // Draw anchor + fly using the shared drawSelection helper
      drawSelection(lat, lon, SEARCH_FLY_HEIGHT);

      // After drawing, update the label text to show the original query
      const pin = viewer.entities.getById('search_anchor_pin');
      if (pin?.label) {
        pin.label.text = new Cesium.ConstantProperty(
          `TARGET: ${label}  (${Number(lat).toFixed(4)}°N, ${Number(lon).toFixed(4)}°E)`
        );
      }
    };

    window.addEventListener('resqmap:search-point', handleSearchEvent);
    return () => window.removeEventListener('resqmap:search-point', handleSearchEvent);
  }, [drawSelection]);

  // ── Clear on reset & Synchronize Cursor ─────────────────
  useEffect(() => {
    if (selectionMode === 'idle') {
      clearBaseEntities();
      clearZoneEntities();
      clearArcEntities();
    }
    const cursorStyle = selectionMode === 'selecting' ? 'crosshair' : 'default';
    if (containerRef.current) {
      containerRef.current.style.cursor = cursorStyle;
    }
    if (viewerRef.current?.canvas) {
      viewerRef.current.canvas.style.cursor = cursorStyle;
    }
  }, [selectionMode, clearBaseEntities, clearZoneEntities, clearArcEntities]);

  return (
    <div
      id="cesium-container"
      ref={containerRef}
      className="h-full w-full relative select-none overflow-hidden"
    >
      {/* ── Floating Map Search Box (top-left of canvas) ──────── */}
      <div className="absolute top-3 left-3 z-30 w-64">
        <div
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs shadow-lg backdrop-blur-md transition-all ${
            mapSearchError
              ? 'border-red-400/60 bg-red-950/80 ring-1 ring-red-400/40'
              : mapSearchLoading
              ? 'border-sky-400/50 bg-zinc-950/85 ring-1 ring-sky-400/30'
              : 'border-white/20 bg-zinc-950/85 hover:border-white/35 focus-within:border-sky-400/60 focus-within:ring-1 focus-within:ring-sky-400/30'
          }`}
        >
          {mapSearchLoading ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" />
          ) : (
            <Search className={`h-3.5 w-3.5 shrink-0 ${
              mapSearchError ? 'text-red-400' : 'text-zinc-400'
            }`} />
          )}
          <input
            ref={mapSearchInputRef}
            id="map-search-input"
            type="text"
            value={mapSearchQuery}
            onChange={(e) => {
              setMapSearchQuery(e.target.value);
              if (mapSearchError) setMapSearchError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleMapSearch();
              if (e.key === 'Escape') {
                setMapSearchQuery('');
                setMapSearchError(null);
                mapSearchInputRef.current?.blur();
              }
            }}
            placeholder={mapSearchError || 'lat, lon or place name…'}
            className={`flex-1 min-w-0 bg-transparent outline-none font-mono text-[11px] placeholder:font-sans placeholder:text-[11px] ${
              mapSearchError
                ? 'text-red-300 placeholder:text-red-400'
                : 'text-white placeholder:text-zinc-500'
            }`}
          />
          {mapSearchQuery && (
            <button
              onClick={() => { setMapSearchQuery(''); setMapSearchError(null); mapSearchInputRef.current?.focus(); }}
              className="shrink-0 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              title="Clear (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {mapSearchQuery && !mapSearchLoading && (
            <button
              id="btn-map-search-go"
              onClick={handleMapSearch}
              className="shrink-0 rounded-md px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] transition cursor-pointer"
              title="Go (Enter)"
            >
              Go
            </button>
          )}
        </div>
        {mapSearchError && (
          <p className="mt-1 text-[10px] text-red-300 font-medium px-1 truncate">
            ⚠ {mapSearchError}
          </p>
        )}
      </div>

      {/* ── Interactive Floating Coordinate Box attached to Crosshair Reticle ── */}
      {selectionMode === 'selecting' && floatingTooltip && (
        <div
          className="absolute z-40 bg-zinc-950/85 backdrop-blur-md text-white text-xs font-mono px-2.5 py-1.5 rounded-lg border border-white/20 shadow-lg pointer-events-none whitespace-nowrap transition-transform duration-75 ease-out"
          style={{
            left: `${floatingTooltip.x}px`,
            top: `${floatingTooltip.y}px`,
          }}
        >
          {floatingTooltip.lat.toFixed(4)}°N, {floatingTooltip.lon.toFixed(4)}°E  |  {Math.round(floatingTooltip.height)}m AMSL
        </div>
      )}

      {/* ── Permanent Static HUD Pinned at Bottom-Left ──────── */}
      <div className="cesium-static-hud">
        <Compass className="cesium-static-hud-icon" />
        <span className="cesium-static-hud-coords">
          {hudCoords.lat.toFixed(4)}°N, {hudCoords.lon.toFixed(4)}°E
        </span>
        {hudCoords.elevation != null && (
          <>
            <span className="cesium-static-hud-sep">·</span>
            <span className="cesium-static-hud-elev">
              {hudCoords.elevation.toLocaleString()}m AMSL
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Dynamic RPI Category Color & Badge Resolvers ──────────
const CATEGORY_COLOR_MAP = {
  Immediate: '#DC2626',      // Red
  'Short-term': '#EA580C',   // Orange
  'Medium-term': '#D97706',  // Amber / Yellow
  'Low Priority': '#059669', // Emerald / Green
  Critical: '#DC2626',
  High: '#EA580C',
  Moderate: '#D97706',
  Safe: '#059669',
  red: '#DC2626',
  orange: '#EA580C',
  yellow: '#D97706',
  green: '#059669',
};

function getCategoryColor(hab) {
  const cat = hab?.category || hab?.tier || '';
  if (CATEGORY_COLOR_MAP[cat]) return CATEGORY_COLOR_MAP[cat];
  if (hab?.color_name && CATEGORY_COLOR_MAP[hab.color_name]) return CATEGORY_COLOR_MAP[hab.color_name];
  if (hab?.color && CATEGORY_COLOR_MAP[hab.color]) return CATEGORY_COLOR_MAP[hab.color];
  const rpi = hab?.rpi;
  if (rpi != null) {
    if (rpi >= 0.60) return '#DC2626';
    if (rpi >= 0.45) return '#EA580C';
    if (rpi >= 0.30) return '#D97706';
    return '#059669';
  }
  return hab?.color || '#DC2626';
}

function getDynamicBadge(hab) {
  const cat = hab?.category || hab?.tier || '';
  const rpi = hab?.rpi;
  if (cat === 'Immediate' || cat === 'Critical' || (rpi != null && rpi >= 0.60)) {
    return '🔴 IMMEDIATE RELOCATION';
  }
  if (cat === 'Short-term' || cat === 'High' || (rpi != null && rpi >= 0.45)) {
    return '🟠 SHORT-TERM RELOCATION';
  }
  if (cat === 'Medium-term' || cat === 'Moderate' || (rpi != null && rpi >= 0.30)) {
    return '🟡 MEDIUM-TERM RELOCATION';
  }
  return '🟢 SAFE ZONE';
}

// ── High-Contrast SVG Pin Generator with Dynamic Color ────
function buildPinSvg(color = '#0284c7') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
      <defs>
        <filter id="s" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <path d="M20 0C9 0 0 9 0 20c0 14 20 32 20 32s20-18 20-32C40 9 31 0 20 0z"
            fill="${color}" filter="url(#s)"/>
      <circle cx="20" cy="19" r="7.5" fill="#ffffff"/>
      <circle cx="20" cy="19" r="4" fill="${color}"/>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
