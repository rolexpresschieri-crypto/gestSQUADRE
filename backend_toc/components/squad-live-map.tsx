"use client";

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
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { MapRoutePoint } from "@/lib/map-routes";
import type { LatLngExpression } from "leaflet";
import { ALARM_RED } from "@/lib/alarm-styles";
import { getMapTileConfig, type LayerMode } from "@/lib/map-layers";
import {
  formatGpsAccuracyMeters,
  hasCoordinates,
  type LiveSquad,
} from "@/lib/live-squads";
import {
  formatWaypointTimestamp,
  waypointDisplayName,
  waypointSourceLabel,
  type SquadWaypoint,
} from "@/lib/waypoints";
import { waypointIconMapUrl } from "@/lib/waypoint-icons";

const defaultCenter: LatLngExpression = [45.0703, 7.6869];

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function squadDivIcon(
  squad: LiveSquad,
  selected: boolean,
  isAlarming: boolean,
): L.DivIcon {
  const chip = escapeHtml((squad.squadName || squad.squadCode).slice(0, 18).toUpperCase());
  const sel = selected ? " gs-dot--selected" : "";
  if (isAlarming) {
    return L.divIcon({
      className: "gs-squad-divicon",
      html: `<div class="gs-pin"><div class="gs-dot gs-dot--alarm${sel}"></div><div class="gs-chip gs-chip--alarm">${chip}</div></div>`,
      iconSize: [96, 44],
      iconAnchor: [48, 10],
      popupAnchor: [0, -30],
    });
  }
  const fill = squad.mapColor;
  return L.divIcon({
    className: "gs-squad-divicon",
    html: `<div class="gs-pin"><div class="gs-dot${sel}" style="background:${fill}"></div><div class="gs-chip">${chip}</div></div>`,
    iconSize: [96, 44],
    iconAnchor: [48, 10],
    popupAnchor: [0, -30],
  });
}

type DrawnRoute = {
  routeCode: string;
  colorHex: string;
  points: MapRoutePoint[];
  highlighted?: boolean;
};

type MapUserNavApi = {
  userNavRef: RefObject<boolean>;
};

/** Dopo pan/zoom manuale non ri-inquadrare automaticamente la mappa. */
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

/** Evita che vie TRK spariscano per un refresh vuoto del polling. */
function useStableRoutes(routes: DrawnRoute[]): DrawnRoute[] {
  const cacheRef = useRef<DrawnRoute[]>([]);
  const lastSeenMsRef = useRef(0);

  return useMemo(() => {
    if (routes.length > 0) {
      cacheRef.current = routes;
      lastSeenMsRef.current = Date.now();
      return routes;
    }
    if (
      cacheRef.current.length > 0 &&
      Date.now() - lastSeenMsRef.current < 30_000
    ) {
      return cacheRef.current;
    }
    cacheRef.current = [];
    return [];
  }, [routes]);
}

function squadMarkerIconKey(
  squad: LiveSquad,
  selected: boolean,
  isAlarming: boolean,
): string {
  return `${squad.sessionId}:${selected}:${isAlarming}:${squad.mapColor}:${squad.squadCode}:${squad.squadName}`;
}

function squadMarkerPopupHtml(squad: LiveSquad, isAlarming: boolean): string {
  const accLabel = formatGpsAccuracyMeters(squad.lastAccuracy);
  const title = isAlarming ? `ALLARME — ${squad.squadCode}` : squad.squadCode;
  const titleColor = isAlarming ? ALARM_RED : "inherit";
  let html =
    `<strong style="color:${titleColor}">${escapeHtml(title)}</strong>` +
    `<br/>${escapeHtml(squad.squadName)}`;
  if (accLabel) {
    html += `<br/>Precisione GPS ${escapeHtml(accLabel)}`;
  }
  return html;
}

function ImperativeSquadMarkersLayer({
  squads,
  alarmingSessionIds,
  selectedSessionId,
  onSelect,
}: {
  squads: LiveSquad[];
  alarmingSessionIds: ReadonlySet<string>;
  selectedSessionId: string | null;
  onSelect: (squad: LiveSquad) => void;
}) {
  const map = useMap();
  const squadsRef = useRef(squads);
  squadsRef.current = squads;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markersRef = useRef(
    new Map<
      string,
      {
        marker: L.Marker;
        circle: L.Circle | null;
        iconKey: string;
      }
    >(),
  );

  useEffect(() => {
    const markers = markersRef.current;
    const alive = new Set(squads.map((s) => s.sessionId));

    for (const [sessionId, entry] of markers) {
      if (!alive.has(sessionId)) {
        entry.circle?.remove();
        entry.marker.remove();
        markers.delete(sessionId);
      }
    }

    for (const squad of squads) {
      if (!hasCoordinates(squad)) {
        continue;
      }
      const position: L.LatLngExpression = [
        squad.lastLatitude!,
        squad.lastLongitude!,
      ];
      const isAlarming = alarmingSessionIds.has(squad.sessionId);
      const selected = selectedSessionId === squad.sessionId;
      const iconKey = squadMarkerIconKey(squad, selected, isAlarming);
      let entry = markers.get(squad.sessionId);

      if (!entry) {
        const marker = L.marker(position, {
          icon: squadDivIcon(squad, selected, isAlarming),
        });
        marker.bindPopup(squadMarkerPopupHtml(squad, isAlarming));
        marker.on("click", () => {
          const current = squadsRef.current.find(
            (row) => row.sessionId === squad.sessionId,
          );
          if (current) {
            onSelectRef.current(current);
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
          entry.marker.setIcon(squadDivIcon(squad, selected, isAlarming));
          entry.iconKey = iconKey;
          entry.marker.setPopupContent(squadMarkerPopupHtml(squad, isAlarming));
        }
      }

      const acc = squad.lastAccuracy;
      const showAccuracyCircle =
        acc != null && Number.isFinite(acc) && acc > 0 && acc <= 120;
      const circleColor = isAlarming ? ALARM_RED : squad.mapColor;

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
          if (Math.abs(entry.circle.getRadius() - acc) >= 1) {
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
  }, [squads, alarmingSessionIds, selectedSessionId, map]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const entry of markers.values()) {
        entry.circle?.remove();
        entry.marker.remove();
      }
      markers.clear();
    };
  }, [map]);

  return null;
}

function MapBoundsController({
  waypoints,
  activeRoutes,
  recenterNonce = 0,
}: {
  waypoints: SquadWaypoint[];
  activeRoutes: DrawnRoute[];
  recenterNonce?: number;
}) {
  const map = useMap();
  const api = useMapUserNav();
  const initialFitDoneRef = useRef(false);
  const lastRecenterNonceRef = useRef(0);

  const fitPoints = useMemo(() => {
    const wpPts = waypoints.map(
      (w) => [w.latitude, w.longitude] as [number, number],
    );
    const routePts = activeRoutes.flatMap((route) =>
      route.points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    return [...wpPts, ...routePts];
  }, [waypoints, activeRoutes]);

  const fitToOperationalArea = useCallback(() => {
    if (fitPoints.length === 0) {
      return;
    }
    if (fitPoints.length === 1) {
      map.setView(fitPoints[0], 15, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(fitPoints), { padding: [40, 40], animate: false });
  }, [fitPoints, map]);

  useEffect(() => {
    if (initialFitDoneRef.current || fitPoints.length === 0) {
      return;
    }
    fitToOperationalArea();
    initialFitDoneRef.current = true;
  }, [fitPoints.length, fitToOperationalArea]);

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

const ROUTE_HALO_WEIGHT = 5;
const ROUTE_LINE_WEIGHT = 3;

const ActiveRoutePolylines = memo(function ActiveRoutePolylines({
  route,
  highlighted = false,
}: {
  route: DrawnRoute;
  highlighted?: boolean;
}) {
  const positions = useMemo(
    () =>
      route.points.length < 2
        ? []
        : route.points.map((p) => [p.lat, p.lng] as [number, number]),
    [route.points],
  );
  const haloOptions = useMemo(
    () => ({
      color: "#ffffff",
      weight: ROUTE_HALO_WEIGHT,
      opacity: highlighted ? 0.98 : 0.9,
      lineCap: "round" as const,
      lineJoin: "round" as const,
    }),
    [highlighted],
  );
  const lineOptions = useMemo(
    () => ({
      color: route.colorHex,
      weight: ROUTE_LINE_WEIGHT,
      opacity: highlighted ? 0.98 : 0.82,
      lineCap: "round" as const,
      lineJoin: "round" as const,
    }),
    [route.colorHex, highlighted],
  );

  if (positions.length < 2) {
    return null;
  }

  return (
    <>
      <Polyline
        key={`${route.routeCode}-halo`}
        positions={positions}
        pathOptions={haloOptions}
      />
      <Polyline
        key={`${route.routeCode}-line`}
        positions={positions}
        pathOptions={lineOptions}
      />
    </>
  );
});

function LeafletInvalidateOnLayout() {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) {
      return;
    }
    doneRef.current = true;
    const mountTimer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 250);
    return () => window.clearTimeout(mountTimer);
  }, [map]);

  return null;
}

const WaypointMapMarker = memo(function WaypointMapMarker({
  waypoint,
  canManageWaypoints,
  onEditWaypoint,
  onDeleteWaypoint,
}: {
  waypoint: SquadWaypoint;
  canManageWaypoints: boolean;
  onEditWaypoint?: (waypoint: SquadWaypoint) => void;
  onDeleteWaypoint?: (waypoint: SquadWaypoint) => void;
}) {
  const icon = useMemo(
    () => waypointDivIcon(waypoint),
    [waypoint.id, waypoint.iconKey, waypoint.label],
  );

  return (
    <Marker
      position={[waypoint.latitude, waypoint.longitude]}
      icon={icon}
      zIndexOffset={800}
    >
      <Popup minWidth={220}>
        <div style={{ color: "#111827" }}>
          <strong>{waypointDisplayName(waypoint)}</strong>
          <br />
          {waypoint.latitude.toFixed(5)}, {waypoint.longitude.toFixed(5)}
          <br />
          {waypointSourceLabel(waypoint.source)} ·{" "}
          {formatWaypointTimestamp(waypoint.createdAt)}
          {canManageWaypoints && (onEditWaypoint || onDeleteWaypoint) ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {onEditWaypoint ? (
                <button type="button" onClick={() => onEditWaypoint(waypoint)}>
                  Modifica
                </button>
              ) : null}
              {onDeleteWaypoint ? (
                <button
                  type="button"
                  onClick={() => onDeleteWaypoint(waypoint)}
                  style={{ color: "#c62828" }}
                >
                  Elimina
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Popup>
    </Marker>
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
  selectedSessionId,
  onSelect,
  canManageWaypoints = false,
  onEditWaypoint,
  onDeleteWaypoint,
  height = "100%",
  recenterNonce = 0,
}: SquadLiveMapProps) {
  const withCoords = squads.filter(hasCoordinates);
  const tile = getMapTileConfig(layerMode);
  const rawRoutesToDraw = useMemo(() => {
    if (activeRoutes.length > 0) {
      return activeRoutes.filter((route) => route.points.length >= 2);
    }
    if (activeRoute && activeRoute.points.length >= 2) {
      return [{ ...activeRoute, highlighted: true }];
    }
    return [];
  }, [activeRoute, activeRoutes]);
  const routesToDraw = useStableRoutes(rawRoutesToDraw);

  return (
    <div style={{ height, width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          key={layerMode}
          attribution={tile.attribution}
          url={tile.url}
          updateWhenZooming={false}
          updateWhenIdle
          keepBuffer={2}
        />
        <MapUserNavProvider>
          <LeafletInvalidateOnLayout />
          <MapUserInteractionTracker />
          <MapBoundsController
            waypoints={waypoints}
            activeRoutes={routesToDraw}
            recenterNonce={recenterNonce}
          />
          <ImperativeSquadMarkersLayer
            squads={withCoords}
            alarmingSessionIds={alarmingSessionIds}
            selectedSessionId={selectedSessionId}
            onSelect={onSelect}
          />
        </MapUserNavProvider>
        {waypoints.map((wp) => (
          <WaypointMapMarker
            key={`wp-${wp.id}`}
            waypoint={wp}
            canManageWaypoints={canManageWaypoints}
            onEditWaypoint={onEditWaypoint}
            onDeleteWaypoint={onDeleteWaypoint}
          />
        ))}
        {routesToDraw.map((route) => (
          <ActiveRoutePolylines
            key={route.routeCode}
            route={route}
            highlighted={route.highlighted}
          />
        ))}
      </MapContainer>
    </div>
  );
}
