"use client";

import { Suspense } from "react";
import WaypointsPage from "@/components/waypoints-page";

export default function WaypointsRoutePage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, color: "#fff", background: "#06080f", minHeight: "100vh" }}>
          Caricamento waypoint…
        </main>
      }
    >
      <WaypointsPage />
    </Suspense>
  );
}
