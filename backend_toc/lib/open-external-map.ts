import { readStoredLayerMode } from "@/lib/map-layer-storage";

/**
 * Apre la mappa in una nuova finestra (trascinabile sul secondo monitor).
 * Stessa sessione localStorage del TOC principale.
 */
export function openExternalMapWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const layer = readStoredLayerMode();
  const url = `${window.location.origin}/map-fullscreen?display=1&layer=${layer}`;
  const w = Math.min(window.screen.availWidth, 2560);
  const h = Math.min(window.screen.availHeight, 1440);
  const features = [
    `width=${w}`,
    `height=${h}`,
    "left=80",
    "top=40",
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=no",
  ].join(",");

  const win = window.open(url, "gestSquadreMapDisplay", features);
  if (win) {
    win.focus();
  }
  return win;
}
