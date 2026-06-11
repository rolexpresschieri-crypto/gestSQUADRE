import { normalizeMapColor } from "@/lib/live-squads";

export type SquadExportRow = {
  squadCode: string;
  squadName: string;
  isEnabled: boolean;
  mapColor: string | null;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sortSquadsForExport(rows: SquadExportRow[]): SquadExportRow[] {
  return [...rows].sort((a, b) =>
    a.squadCode.localeCompare(b.squadCode, "it", { sensitivity: "base" }),
  );
}

/** Cerchio colorato in SVG: in stampa/PDF i fill CSS spesso spariscono. */
function squadColorDotHtml(mapColor: string | null): string {
  const fill = normalizeMapColor(mapColor);
  return `<svg class="colorDot" width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" focusable="false"><circle cx="5.5" cy="5.5" r="4.5" fill="${fill}" stroke="#666666" stroke-width="1"/></svg>`;
}

export function squadsPrintHtml(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
): string {
  const sorted = sortSquadsForExport(rows);
  const exportedAt = new Date().toLocaleString("it-IT");
  const bodyRows = sorted
    .map((r) => {
      return `<tr>
        <td class="codeCell">
          ${squadColorDotHtml(r.mapColor)}
          <strong>${escapeHtml(r.squadCode)}</strong>
        </td>
        <td>${escapeHtml(r.squadName)}</td>
        <td>${r.isEnabled ? "Attiva" : "Disabilitata"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Elenco squadre — gestSQUADRE</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { font-family: system-ui, sans-serif; padding: 16px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    p.meta { font-size: 12px; color: #444; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #bbb; padding: 7px 8px; text-align: left; vertical-align: middle; }
    th { background: #eee; font-weight: 700; }
    .codeCell { white-space: nowrap; }
    .colorDot {
      display: inline-block;
      width: 11px;
      height: 11px;
      margin-right: 8px;
      vertical-align: middle;
    }
    tfoot td { border: none; padding-top: 12px; font-size: 11px; color: #555; }
  </style>
</head>
<body>
  <h1>Elenco squadre — ${escapeHtml(courseLabel)}</h1>
  <p class="meta">Campo: ${escapeHtml(courseCode)} · Esportato: ${escapeHtml(exportedAt)} · Ordine: codice squadra (A→Z)</p>
  <table>
    <thead>
      <tr>
        <th>Codice squadra</th>
        <th>Nome squadra</th>
        <th>Stato</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr><td colspan="3">Totale squadre: ${sorted.length}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;
}

/** Apre la finestra di stampa (Salva come PDF); il nome file lo scegli tu nel browser. */
export function printSquadsAsPdf(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Export squadre gestSQUADRE");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(squadsPrintHtml(rows, courseLabel, courseCode));
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  if (doc.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 250);
  }

  return true;
}
