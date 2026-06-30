"use client";

import "@/components/squad-live-map.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { MapRoutePoint } from "@/lib/map-routes";
import type { LatLngExpression } from "leaflet";
import { ALARM_RED } from "@/lib/alarm-styles";
import { getMapTileConfig, type LayerMode } from "@/lib/map-layers";
import { MAP_SQUAD_POLL_MS } from "@/lib/map-refresh";
import {
  formatGpsAccuracyMeters,
  hasCoordinates,
  liveSquadsPollSig,
  type LiveSquad,
} from "@/lib/live-squads";
import {
  formatWaypointTimestamp,
  waypointDisplayName,
  waypointSourceLabel,
  type SquadWaypoint,
} from "@/lib/waypoints";
import { waypointIconMapUrl } from "@/lib/waypoint-icons";
import { squadIconMapUrl } from "@/lib/squad-icons";

const defaultCenter: LatLngExpression = [45.0703, 7.6869];
const EVENT_BLUE = "#1e5f9e";
const ROUTE_HALO_WEIGHT = 5;
const ROUTE_LINE_WEIGHT = 3;
const MAP_SYNC_MS = MAP_SQUAD_POLL_MS;

type DrawnRoute = {
  routeCode: string;
  colorHex: string;
  points: MapRoutePoint[];
  highlighted?: boolean;
};

type MapLiveData = {
  squads: LiveSquad[];
  routes: DrawnRoute[];
  waypoints: SquadWaypoint[];
  alarmingSessionIds: ReadonlySet<string>;
  eventTargetSessionIds: ReadonlySet<string>;
  selectedSessionId: string | null;
  recenterNonce: number;
  onSelect: (squad: LiveSquad) => void;
};

type MapUserNavApi = {
  userNavRef: RefObject<boolean>;
};

const MapUserNavContext = createContext<MapUserNavApi | null>(null);

function useMapUserNav() {
  return useContext(MapUserNavContext);
}

function MapUserNavProvider({ children }: { children: ReactNode }) {
  const userNavRef = useRef(false);
  const api = useMemo(() => ({ userNavRef }), []);

  useEffect(() => {
    return () => {
      userNavRef.current = false;
    };
  }, []);

  return (
    <MapUserNavContext.Provider value={api}>
      {children}
    </MapUserNavContext.Provider>
  );
}

function MapUserInteractionTracker() {
  const map = useMap();
  const api = useMapUserNav();

  useEffect(() => {
    if (!api) {
      return;
    }
    const markUserNav = () => {
      api.userNavRef.current = true;
    };
    const onZoom = (event: L.LeafletEvent) => {
      const originalEvent = (event as L.LeafletEvent & { originalEvent?: Event })
        .originalEvent;
      if (originalEvent) {
        markUserNav();
      }
    };
    map.on("dragstart", markUserNav);
    map.on("zoomstart", onZoom);
    return () => {
      map.off("dragstart", markUserNav);
      map.off("zoomstart", onZoom);
    };
  }, [map, api]);

  return null;
}

function MapChrome() {
  const map = useMap();

  useEffect(() => {
    const scale = L.control.scale({
      position: "bottomleft",
      imperial: false,
      metric: true,
      maxWidth: 140,
    });
    scale.addTo(map);
    return () => {
      scale.remove();
    };
  }, [map]);

  return null;
}

function MapNorthArrow() {
  return (
    <div className="gs-map-north" aria-hidden title="Nord">
      <svg className="gs-map-north-icon" viewBox="0 0 24 28" width="18" height="21" role="img">
        <path
          d="M12 2 L21 24 L12 19 L3 24 Z"
          fill="#f5f5f5"
          stroke="#1a1a1a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="gs-map-north-label">N</span>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SQUAD_CHIP_MAX_CHARS = 28;

function squadMapChipLabel(squad: LiveSquad): string {
  const raw = (squad.squadName || squad.squadCode).trim();
  return raw.slice(0, SQUAD_CHIP_MAX_CHARS).toUpperCase();
}

function squadMarkerWidth(chip: string): number {
  return Math.max(112, Math.min(chip.length * 7 + 28, 220));
}

function waypointDivIcon(waypoint: SquadWaypoint): L.DivIcon {
  const name = escapeHtml(waypointDisplayName(waypoint).slice(0, 22).toUpperCase());
  const iconUrl = waypointIconMapUrl(waypoint.iconKey);
  return L.divIcon({
    className: "gs-wp-divicon",
    html: `<div class="gs-wp-pin"><img class="gs-wp-icon" src="${iconUrl}" width="28" height="28" alt="" /><div class="gs-wp-chip">${name}</div></div>`,
    iconSize: [96, 46],
    iconAnchor: [48, 14],
    popupAnchor: [0, -18],
  });
}

function squadDivIcon(
  squad: LiveSquad,
  selected: boolean,
  isAlarming: boolean,
  isEventTarget: boolean,
): L.DivIcon {
  const chip = escapeHtml(squadMapChipLabel(squad));
  const sel = selected ? " gs-squad-icon-wrap--selected" : "";
  const alarm = isAlarming ? " gs-squad-icon-wrap--alarm" : "";
  const event = !isAlarming && isEventTarget ? " gs-squad-icon-wrap--event" : "";
  const iconUrl = squadIconMapUrl(squad.mapIconKey);
  const chipClass = isAlarming
    ? "gs-chip gs-chip--alarm"
    : isEventTarget
      ? "gs-chip gs-chip--event"
      : "gs-chip";
  const markerWidth = squadMarkerWidth(chip);
  return L.divIcon({
    className: "gs-squad-divicon",
    html: `<div class="gs-pin"><div class="gs-squad-icon-wrap${sel}${alarm}${event}"><img class="gs-squad-icon" src="${iconUrl}" width="28" height="28" alt="" /></div><div class="${chipClass}">${chip}</div></div>`,
    iconSize: [markerWidth, 46],
    iconAnchor: [markerWidth / 2, 14],
    popupAnchor: [0, -18],
  });
}

function squadMarkerIconKey(
  squad: LiveSquad,
  selected: boolean,
  isAlarming: boolean,
  isEventTarget: boolean,
): string {
  return `${squad.sessionId}:${selected}:${isAlarming}:${isEventTarget}:${squad.mapColor}:${squad.mapIconKey}:${squad.squadCode}:${squad.squadName}`;
}

function squadMarkerPopupHtml(
  squad: LiveSquad,
  isAlarming: boolean,
  isEventTarget: boolean,
): string {
  const accLabel = formatGpsAccuracyMeters(squad.lastAccuracy);
  const title = isAlarming
    ? `ALLARME — ${squad.squadCode}`
    : isEventTarget
      ? `EVENTO — ${squad.squadCode}`
      : squad.squadCode;
  const titleColor = isAlarming ? ALARM_RED : isEventTarget ? EVENT_BLUE : "inherit";
  let html =
    `<strong style="color:${titleColor}">${escapeHtml(title)}</strong>` +
    `<br/>${escapeHtml(squad.squadName)}`;
  if (accLabel) {
    html += `<br/>Precisione GPS ${escapeHtml(accLabel)}`;
  }
  return html;
}

function routesDrawSig(routes: DrawnRoute[]): string {
  return routes
    .map(
      (route) =>
        `${route.routeCode}:${route.colorHex}:${route.highlighted ? 1 : 0}:${route.points
          .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
          .join(";")}`,
    )
    .join("|");
}

function waypointsSig(waypoints: SquadWaypoint[]): string {
  return waypoints
    .map((wp) => `${wp.id}:${wp.latitude.toFixed(5)},${wp.longitude.toFixed(5)}`)
    .join("|");
}

function sessionIdSetSig(ids: ReadonlySet<string>): string {
  return [...ids].sort().join(",");
}

function MapImperativeLayers({ dataRef }: { dataRef: RefObject<MapLiveData> }) {
  const map = useMap();
  const routeCacheRef = useRef<{ routes: DrawnRoute[]; lastSeenMs: number }>({
    routes: [],
    lastSeenMs: 0,
  });

  const getStableRoutes = useCallback((): DrawnRoute[] => {
    const routes = dataRef.current?.routes ?? [];
    const cache = routeCacheRef.current;
    if (routes.length > 0) {
      cache.routes = routes;
      cache.lastSeenMs = Date.now();
      return routes;
    }
    if (cache.routes.length > 0 && Date.now() - cache.lastSeenMs < 30_000) {
      return cache.routes;
    }
    cache.routes = [];
    return [];
  }, [dataRef]);
  const squadMarkersRef = useRef(
    new Map<
      string,
      {
        marker: L.Marker;
        circle: L.Circle | null;
        iconKey: string;
      }
    >(),
  );
  const routeLayersRef = useRef(
    new Map<
      string,
      {
        halo: L.Polyline;
        line: L.Polyline;
        styleKey: string;
      }
    >(),
  );
  const waypointMarkersRef = useRef(new Map<string, L.Marker>());
  const lastSquadPosSigRef = useRef("");
  const lastSquadMetaSigRef = useRef("");
  const lastRoutesSigRef = useRef("");
  const lastWaypointsSigRef = useRef("");

  const syncSquads = useCallback(
    (data: MapLiveData) => {
      const squads = data.squads.filter(hasCoordinates);
      const markers = squadMarkersRef.current;
      const alive = new Set(squads.map((s) => s.sessionId));

      for (const [sessionId, entry] of markers) {
        if (!alive.has(sessionId)) {
          entry.circle?.remove();
          entry.marker.remove();
          markers.delete(sessionId);
        }
      }

      for (const squad of squads) {
        const position: L.LatLngExpression = [
          squad.lastLatitude!,
          squad.lastLongitude!,
        ];
        const isAlarming = data.alarmingSessionIds.has(squad.sessionId);
        const isEventTarget =
          !isAlarming && data.eventTargetSessionIds.has(squad.sessionId);
        const selected = data.selectedSessionId === squad.sessionId;
        const iconKey = squadMarkerIconKey(squad, selected, isAlarming, isEventTarget);
        let entry = markers.get(squad.sessionId);

        if (!entry) {
          const marker = L.marker(position, {
            icon: squadDivIcon(squad, selected, isAlarming, isEventTarget),
          });
          marker.bindPopup(squadMarkerPopupHtml(squad, isAlarming, isEventTarget));
          marker.on("click", () => {
            const current = dataRef.current?.squads.find(
              (row) => row.sessionId === squad.sessionId,
            );
            if (current) {
              dataRef.current?.onSelect(current);
            }
          });
          marker.addTo(map);
          entry = { marker, circle: null, iconKey };
          markers.set(squad.sessionId, entry);
        } else {
          const nextLatLng = L.latLng(position);
          if (!entry.marker.getLatLng().equals(nextLatLng)) {
            entry.marker.setLatLng(nextLatLng);
          }
          if (entry.iconKey !== iconKey) {
            entry.marker.setIcon(squadDivIcon(squad, selected, isAlarming, isEventTarget));
            entry.iconKey = iconKey;
            entry.marker.setPopupContent(
              squadMarkerPopupHtml(squad, isAlarming, isEventTarget),
            );
          }
        }

        const acc = squad.lastAccuracy;
        const showAccuracyCircle =
          acc != null && Number.isFinite(acc) && acc > 0 && acc <= 120;
        const circleColor = isAlarming
          ? ALARM_RED
          : isEventTarget
            ? EVENT_BLUE
            : squad.mapColor;

        if (showAccuracyCircle) {
          if (!entry.circle) {
            entry.circle = L.circle(position, {
              radius: acc,
              color: circleColor,
              fillColor: circleColor,
              fillOpacity: 0.12,
              weight: 1,
            }).addTo(map);
          } else {
            const circleLatLng = L.latLng(position);
            if (!entry.circle.getLatLng().equals(circleLatLng)) {
              entry.circle.setLatLng(circleLatLng);
            }
            if (Math.abs(entry.circle.getRadius() - acc) >= 2) {
              entry.circle.setRadius(acc);
            }
            entry.circle.setStyle({
              color: circleColor,
              fillColor: circleColor,
            });
          }
        } else if (entry.circle) {
          entry.circle.remove();
          entry.circle = null;
        }
      }
    },
    [dataRef, map],
  );

  const syncRoutes = useCallback(
    (routes: DrawnRoute[]) => {
      const layers = routeLayersRef.current;
      const alive = new Set(routes.map((route) => route.routeCode));

      for (const [routeCode, entry] of layers) {
        if (!alive.has(routeCode)) {
          entry.halo.remove();
          entry.line.remove();
          layers.delete(routeCode);
        }
      }

      for (const route of routes) {
        if (route.points.length < 2) {
          continue;
        }
        const positions = route.points.map(
          (p) => [p.lat, p.lng] as [number, number],
        );
        const highlighted = Boolean(route.highlighted);
        const styleKey = `${route.colorHex}:${highlighted ? 1 : 0}`;
        const haloOpacity = highlighted ? 0.98 : 0.9;
        const lineOpacity = highlighted ? 0.98 : 0.82;
        let entry = layers.get(route.routeCode);

        if (!entry) {
          const halo = L.polyline(positions, {
            color: "#ffffff",
            weight: ROUTE_HALO_WEIGHT,
            opacity: haloOpacity,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);
          const line = L.polyline(positions, {
            color: route.colorHex,
            weight: ROUTE_LINE_WEIGHT,
            opacity: lineOpacity,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);
          layers.set(route.routeCode, { halo, line, styleKey });
          continue;
        }

        entry.halo.setLatLngs(positions);
        entry.line.setLatLngs(positions);
        if (entry.styleKey !== styleKey) {
          entry.halo.setStyle({ opacity: haloOpacity });
          entry.line.setStyle({
            color: route.colorHex,
            opacity: lineOpacity,
          });
          entry.styleKey = styleKey;
        }
      }
    },
    [map],
  );

  const syncWaypoints = useCallback(
    (waypoints: SquadWaypoint[]) => {
      const markers = waypointMarkersRef.current;
      const alive = new Set(waypoints.map((wp) => wp.id));

      for (const [id, marker] of markers) {
        if (!alive.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }

      for (const waypoint of waypoints) {
        const position: L.LatLngExpression = [
          waypoint.latitude,
          waypoint.longitude,
        ];
        let marker = markers.get(waypoint.id);
        const popupHtml =
          `<div style="color:#111827">` +
          `<strong>${escapeHtml(waypointDisplayName(waypoint))}</strong><br/>` +
          `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}<br/>` +
          `${escapeHtml(waypointSourceLabel(waypoint.source))} · ` +
          `${escapeHtml(formatWaypointTimestamp(waypoint.createdAt))}` +
          `</div>`;

        if (!marker) {
          marker = L.marker(position, {
            icon: waypointDivIcon(waypoint),
            zIndexOffset: 800,
          });
          marker.bindPopup(popupHtml, { minWidth: 220 });
          marker.addTo(map);
          markers.set(waypoint.id, marker);
        } else {
          const nextLatLng = L.latLng(position);
          if (!marker.getLatLng().equals(nextLatLng)) {
            marker.setLatLng(nextLatLng);
          }
          marker.setPopupContent(popupHtml);
        }
      }
    },
    [map],
  );

  const runSync = useCallback(() => {
    const data = dataRef.current;
    if (!data) {
      return;
    }

    const stableRoutes = getStableRoutes();
    const withCoords = data.squads.filter(hasCoordinates);
    const posSig = liveSquadsPollSig(withCoords);
    const metaSig = `${posSig}|${data.selectedSessionId ?? ""}|${sessionIdSetSig(data.alarmingSessionIds)}|${sessionIdSetSig(data.eventTargetSessionIds)}`;
    const routesSig = routesDrawSig(stableRoutes);
    const wpSig = waypointsSig(data.waypoints);

    if (metaSig !== lastSquadMetaSigRef.current) {
      syncSquads(data);
      lastSquadMetaSigRef.current = metaSig;
      lastSquadPosSigRef.current = posSig;
    } else if (posSig !== lastSquadPosSigRef.current) {
      syncSquads(data);
      lastSquadPosSigRef.current = posSig;
    }

    if (routesSig !== lastRoutesSigRef.current) {
      syncRoutes(stableRoutes);
      lastRoutesSigRef.current = routesSig;
    }

    if (wpSig !== lastWaypointsSigRef.current) {
      syncWaypoints(data.waypoints);
      lastWaypointsSigRef.current = wpSig;
    }
  }, [dataRef, getStableRoutes, syncRoutes, syncSquads, syncWaypoints]);

  useEffect(() => {
    runSync();
    const timer = window.setInterval(runSync, MAP_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [runSync]);

  useEffect(() => {
    const squadMarkers = squadMarkersRef.current;
    const routeLayers = routeLayersRef.current;
    const waypointMarkers = waypointMarkersRef.current;
    return () => {
      for (const entry of squadMarkers.values()) {
        entry.circle?.remove();
        entry.marker.remove();
      }
      squadMarkers.clear();
      for (const entry of routeLayers.values()) {
        entry.halo.remove();
        entry.line.remove();
      }
      routeLayers.clear();
      for (const marker of waypointMarkers.values()) {
        marker.remove();
      }
      waypointMarkers.clear();
    };
  }, [map]);

  return null;
}

function MapBoundsController({
  dataRef,
  recenterNonce,
}: {
  dataRef: RefObject<MapLiveData>;
  recenterNonce: number;
}) {
  const map = useMap();
  const api = useMapUserNav();
  const initialFitDoneRef = useRef(false);
  const lastRecenterNonceRef = useRef(0);
  const routeCacheRef = useRef<{ routes: DrawnRoute[]; lastSeenMs: number }>({
    routes: [],
    lastSeenMs: 0,
  });

  const getStableRoutes = useCallback((): DrawnRoute[] => {
    const routes = dataRef.current?.routes ?? [];
    const cache = routeCacheRef.current;
    if (routes.length > 0) {
      cache.routes = routes;
      cache.lastSeenMs = Date.now();
      return routes;
    }
    if (cache.routes.length > 0 && Date.now() - cache.lastSeenMs < 30_000) {
      return cache.routes;
    }
    cache.routes = [];
    return [];
  }, [dataRef]);

  const fitToOperationalArea = useCallback(() => {
    const data = dataRef.current;
    if (!data) {
      return;
    }
    const stableRoutes = getStableRoutes();
    const wpPts = data.waypoints.map(
      (w) => [w.latitude, w.longitude] as [number, number],
    );
    const routePts = stableRoutes.flatMap((route) =>
      route.points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    const fitPoints = [...wpPts, ...routePts];
    if (fitPoints.length === 0) {
      return;
    }
    if (fitPoints.length === 1) {
      map.setView(fitPoints[0], 15, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(fitPoints), { padding: [40, 40], animate: false });
  }, [dataRef, getStableRoutes, map]);

  useEffect(() => {
    const tryInitialFit = () => {
      if (initialFitDoneRef.current || api?.userNavRef.current) {
        return;
      }
      const data = dataRef.current;
      if (!data) {
        return;
      }
      const stableRoutes = getStableRoutes();
      const hasArea =
        data.waypoints.length > 0 ||
        stableRoutes.some((route) => route.points.length > 0);
      if (!hasArea) {
        return;
      }
      fitToOperationalArea();
      initialFitDoneRef.current = true;
    };
    tryInitialFit();
    const timer = window.setInterval(tryInitialFit, MAP_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [api, dataRef, fitToOperationalArea, getStableRoutes]);

  useEffect(() => {
    if (recenterNonce <= 0 || recenterNonce === lastRecenterNonceRef.current) {
      return;
    }
    lastRecenterNonceRef.current = recenterNonce;
    if (api) {
      api.userNavRef.current = false;
    }
    fitToOperationalArea();
  }, [recenterNonce, api, fitToOperationalArea]);

  return null;
}

const StableMapShell = memo(function StableMapShell({
  layerMode,
  height,
  dataRef,
  recenterNonce,
}: {
  layerMode: LayerMode;
  height: string;
  dataRef: RefObject<MapLiveData>;
  recenterNonce: number;
}) {
  const tile = getMapTileConfig(layerMode);

  return (
    <div className="gs-map-shell" style={{ height, width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          key={layerMode}
          attribution={tile.attribution}
          url={tile.url}
          updateWhenZooming={false}
          updateWhenIdle
          keepBuffer={4}
          maxNativeZoom={19}
          maxZoom={20}
        />
        <MapChrome />
        <MapUserNavProvider>
          <MapUserInteractionTracker />
          <MapBoundsController dataRef={dataRef} recenterNonce={recenterNonce} />
          <MapImperativeLayers dataRef={dataRef} />
        </MapUserNavProvider>
      </MapContainer>
      <MapNorthArrow />
    </div>
  );
});

type SquadLiveMapProps = {
  layerMode: LayerMode;
  squads: LiveSquad[];
  waypoints?: SquadWaypoint[];
  activeRoute?: {
    routeCode: string;
    colorHex: string;
    points: MapRoutePoint[];
  } | null;
  activeRoutes?: Array<{
    routeCode: string;
    colorHex: string;
    points: MapRoutePoint[];
    highlighted?: boolean;
  }>;
  alarmingSessionIds: ReadonlySet<string>;
  eventTargetSessionIds?: ReadonlySet<string>;
  selectedSessionId: string | null;
  onSelect: (squad: LiveSquad) => void;
  canManageWaypoints?: boolean;
  onEditWaypoint?: (waypoint: SquadWaypoint) => void;
  onDeleteWaypoint?: (waypoint: SquadWaypoint) => void;
  height?: string;
  recenterNonce?: number;
};

export default function SquadLiveMap({
  layerMode,
  squads,
  waypoints = [],
  activeRoute = null,
  activeRoutes = [],
  alarmingSessionIds,
  eventTargetSessionIds = new Set(),
  selectedSessionId,
  onSelect,
  height = "100%",
  recenterNonce = 0,
}: SquadLiveMapProps) {
  const dataRef = useRef<MapLiveData>({
    squads: [],
    routes: [],
    waypoints: [],
    alarmingSessionIds: new Set(),
    eventTargetSessionIds: new Set(),
    selectedSessionId: null,
    recenterNonce: 0,
    onSelect,
  });

  const routes = useMemo(() => {
    if (activeRoutes.length > 0) {
      return activeRoutes.filter((route) => route.points.length >= 2);
    }
    if (activeRoute && activeRoute.points.length >= 2) {
      return [{ ...activeRoute, highlighted: true }];
    }
    return [];
  }, [activeRoute, activeRoutes]);

  dataRef.current = {
    squads,
    routes,
    waypoints,
    alarmingSessionIds,
    eventTargetSessionIds,
    selectedSessionId,
    recenterNonce,
    onSelect,
  };

  return (
    <StableMapShell
      layerMode={layerMode}
      height={height}
      dataRef={dataRef}
      recenterNonce={recenterNonce}
    />
  );
}
