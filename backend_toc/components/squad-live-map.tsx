"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect, useMemo, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
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
    html: `<div class="gs-wp-pin"><img class="gs-wp-icon" src="${iconUrl}" width="40" height="40" alt="" /><div class="gs-wp-chip">${name}</div></div>`,
    iconSize: [120, 56],
    iconAnchor: [60, 18],
    popupAnchor: [0, -22],
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

function MapBoundsController({
  squads,
  waypoints,
}: {
  squads: LiveSquad[];
  waypoints: SquadWaypoint[];
}) {
  const map = useMap();
  const lastBoundsSignatureRef = useRef<string | null>(null);

  const boundsSignature = useMemo(() => {
    const squadPart = squads
      .filter(hasCoordinates)
      .map((s) => s.sessionId)
      .sort()
      .join("|");
    const wpPart = waypoints
      .map((w) => w.id)
      .sort()
      .join("|");
    return `${squadPart}#${wpPart}`;
  }, [squads, waypoints]);

  const points = useMemo(() => {
    const squadPts = squads
      .filter(hasCoordinates)
      .map((s) => [s.lastLatitude!, s.lastLongitude!] as [number, number]);
    const wpPts = waypoints.map(
      (w) => [w.latitude, w.longitude] as [number, number],
    );
    return [...squadPts, ...wpPts];
  }, [squads, waypoints]);

  useEffect(() => {
    if (!boundsSignature) {
      return;
    }
    if (boundsSignature === lastBoundsSignatureRef.current) {
      return;
    }
    lastBoundsSignatureRef.current = boundsSignature;

    if (points.length === 0) {
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, boundsSignature, points]);

  return null;
}

function MapFocusSelected({
  squads,
  selectedSessionId,
}: {
  squads: LiveSquad[];
  selectedSessionId: string | null;
}) {
  const map = useMap();
  const lastFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }
    const squad = squads.find((s) => s.sessionId === selectedSessionId);
    if (!squad || !hasCoordinates(squad)) {
      return;
    }
    const sig = `${selectedSessionId}:${squad.lastLatitude}:${squad.lastLongitude}`;
    if (sig === lastFocusRef.current) {
      return;
    }
    lastFocusRef.current = sig;
    map.flyTo([squad.lastLatitude!, squad.lastLongitude!], Math.max(map.getZoom(), 15), {
      duration: 0.5,
    });
  }, [map, selectedSessionId, squads]);

  return null;
}

function LeafletInvalidateOnLayout() {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();
    const invalidate = () => map.invalidateSize({ animate: false });

    invalidate();
    const raf = requestAnimationFrame(() => {
      invalidate();
      requestAnimationFrame(invalidate);
    });
    const timeouts = [40, 120, 350, 800].map((ms) => window.setTimeout(invalidate, ms));
    const ro = new ResizeObserver(() => invalidate());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      timeouts.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [map]);

  return null;
}

type SquadLiveMapProps = {
  layerMode: LayerMode;
  squads: LiveSquad[];
  waypoints?: SquadWaypoint[];
  alarmingSessionIds: ReadonlySet<string>;
  selectedSessionId: string | null;
  onSelect: (squad: LiveSquad) => void;
  canManageWaypoints?: boolean;
  onEditWaypoint?: (waypoint: SquadWaypoint) => void;
  onDeleteWaypoint?: (waypoint: SquadWaypoint) => void;
  height?: string;
};

export default function SquadLiveMap({
  layerMode,
  squads,
  waypoints = [],
  alarmingSessionIds,
  selectedSessionId,
  onSelect,
  canManageWaypoints = false,
  onEditWaypoint,
  onDeleteWaypoint,
  height = "100%",
}: SquadLiveMapProps) {
  const withCoords = squads.filter(hasCoordinates);
  const tile = getMapTileConfig(layerMode);

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
        <LeafletInvalidateOnLayout />
        <MapBoundsController squads={withCoords} waypoints={waypoints} />
        <MapFocusSelected squads={withCoords} selectedSessionId={selectedSessionId} />
        {waypoints.map((wp) => (
          <Marker
            key={`wp-${wp.id}`}
            position={[wp.latitude, wp.longitude]}
            icon={waypointDivIcon(wp)}
            zIndexOffset={800}
          >
            <Popup minWidth={220}>
              <div style={{ color: "#111827" }}>
                <strong>{waypointDisplayName(wp)}</strong>
                <br />
                {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                <br />
                {waypointSourceLabel(wp.source)} ·{" "}
                {formatWaypointTimestamp(wp.createdAt)}
                {canManageWaypoints && (onEditWaypoint || onDeleteWaypoint) ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {onEditWaypoint ? (
                      <button type="button" onClick={() => onEditWaypoint(wp)}>
                        Modifica
                      </button>
                    ) : null}
                    {onDeleteWaypoint ? (
                      <button
                        type="button"
                        onClick={() => onDeleteWaypoint(wp)}
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
        ))}
        {withCoords.map((squad) => {
          const isAlarming = alarmingSessionIds.has(squad.sessionId);
          const acc = squad.lastAccuracy;
          const accLabel = formatGpsAccuracyMeters(acc);
          const showAccuracyCircle =
            acc != null && Number.isFinite(acc) && acc > 0 && acc <= 120;
          return (
            <Fragment key={squad.sessionId}>
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
                icon={squadDivIcon(
                  squad,
                  selectedSessionId === squad.sessionId,
                  isAlarming,
                )}
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
        })}
      </MapContainer>
    </div>
  );
}
