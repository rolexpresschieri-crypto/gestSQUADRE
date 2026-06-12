"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  createContext,
  Fragment,
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
  Circle,
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

function ActiveRoutePolylines({
  route,
  highlighted = false,
}: {
  route: DrawnRoute;
  highlighted?: boolean;
}) {
  if (route.points.length < 2) {
    return null;
  }
  const positions = route.points.map(
    (p) => [p.lat, p.lng] as [number, number],
  );
  const haloWeight = highlighted ? 7 : 5;
  const lineWeight = highlighted ? 4 : 3;

  return (
    <>
      <Polyline
        key={`${route.routeCode}-halo`}
        positions={positions}
        pathOptions={{
          color: "#ffffff",
          weight: haloWeight,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
      <Polyline
        key={`${route.routeCode}-line`}
        positions={positions}
        pathOptions={{
          color: route.colorHex,
          weight: lineWeight,
          opacity: 0.98,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </>
  );
}

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

const SquadMapMarker = memo(function SquadMapMarker({
  squad,
  selected,
  isAlarming,
  onSelect,
}: {
  squad: LiveSquad;
  selected: boolean;
  isAlarming: boolean;
  onSelect: (squad: LiveSquad) => void;
}) {
  const icon = useMemo(
    () => squadDivIcon(squad, selected, isAlarming),
    [
      squad.sessionId,
      squad.squadCode,
      squad.squadName,
      squad.mapColor,
      selected,
      isAlarming,
    ],
  );
  const acc = squad.lastAccuracy;
  const accLabel = formatGpsAccuracyMeters(acc);
  const showAccuracyCircle =
    acc != null && Number.isFinite(acc) && acc > 0 && acc <= 120;

  return (
    <Fragment>
      {showAccuracyCircle ? (
        <Circle
          center={[squad.lastLatitude!, squad.lastLongitude!]}
          radius={acc}
          pathOptions={{
            color: isAlarming ? ALARM_RED : squad.mapColor,
            fillColor: isAlarming ? ALARM_RED : squad.mapColor,
            fillOpacity: 0.12,
            weight: 1,
          }}
        />
      ) : null}
      <Marker
        position={[squad.lastLatitude!, squad.lastLongitude!]}
        icon={icon}
        eventHandlers={{ click: () => onSelect(squad) }}
      >
        <Popup>
          <strong style={{ color: isAlarming ? ALARM_RED : undefined }}>
            {isAlarming ? "ALLARME — " : ""}
            {squad.squadCode}
          </strong>
          <br />
          {squad.squadName}
          {accLabel ? (
            <>
              <br />
              Precisione GPS {accLabel}
            </>
          ) : null}
        </Popup>
      </Marker>
    </Fragment>
  );
});

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
      >
        <TileLayer
          key={layerMode}
          attribution={tile.attribution}
          url={tile.url}
        />
        <MapUserNavProvider>
          <LeafletInvalidateOnLayout />
          <MapUserInteractionTracker />
          <MapBoundsController
            waypoints={waypoints}
            activeRoutes={routesToDraw}
            recenterNonce={recenterNonce}
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
        {withCoords.map((squad) => (
          <SquadMapMarker
            key={squad.sessionId}
            squad={squad}
            selected={selectedSessionId === squad.sessionId}
            isAlarming={alarmingSessionIds.has(squad.sessionId)}
            onSelect={onSelect}
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
