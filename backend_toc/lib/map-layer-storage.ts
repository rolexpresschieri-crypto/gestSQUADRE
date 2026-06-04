import type { LayerMode } from "@/lib/map-layers";

export const MAP_LAYER_STORAGE_KEY = "gest_squadre_map_layer";

export function readStoredLayerMode(): LayerMode {
  if (typeof window === "undefined") {
    return "standard";
  }
  const v = window.localStorage.getItem(MAP_LAYER_STORAGE_KEY);
  return v === "orthophoto" ? "orthophoto" : "standard";
}

export function writeStoredLayerMode(mode: LayerMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(MAP_LAYER_STORAGE_KEY, mode);
}
