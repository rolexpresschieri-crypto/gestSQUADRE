"use client";

import { Suspense } from "react";
import EventLogsPage from "@/components/event-logs-page";

export default function LogsRoutePage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: "#f5f5f5" }}>Caricamento log…</div>}>
      <EventLogsPage />
    </Suspense>
  );
}
