import { readStoredLayerMode } from "@/lib/map-layer-storage";

const MAP_DISPLAY_WINDOW_NAME = "gestSquadreMapDisplay";

function getStoredMapDisplayWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window.__gestMapDisplayWin;
  if (win && !win.closed) {
    return win;
  }
  window.__gestMapDisplayWin = null;
  return null;
}

/**
 * Apre la mappa in una nuova finestra (trascinabile sul secondo monitor).
 * Stessa sessione localStorage del TOC principale.
 * Se la finestra è già aperta, la porta in primo piano senza ricaricare la pagina.
 */
export function openExternalMapWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const existing = getStoredMapDisplayWindow();
  if (existing) {
    existing.focus();
    return existing;
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

  const win = window.open(url, MAP_DISPLAY_WINDOW_NAME, features);
  if (win) {
    window.__gestMapDisplayWin = win;
    win.focus();
  }
  return win;
}

declare global {
  interface Window {
    __gestMapDisplayWin?: Window | null;
  }
}
