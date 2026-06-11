export type SquadExportRow = {
  squadCode: string;
  squadName: string;
  isEnabled: boolean;
};

export function sortSquadsForExport(rows: SquadExportRow[]): SquadExportRow[] {
  return [...rows].sort((a, b) =>
    a.squadCode.localeCompare(b.squadCode, "it", { sensitivity: "base" }),
  );
}

export function squadsPdfDocumentTitle(courseCode: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeCode = courseCode.trim().replace(/[^\w-]+/g, "_") || "campo";
  return `gestSQUADRE elenco squadre ${safeCode} ${stamp}`;
}

export function squadsPdfFilename(courseCode: string): string {
  return `${squadsPdfDocumentTitle(courseCode)}.pdf`;
}

type JsPdfWithAutoTable = import("jspdf").jsPDF & {
  lastAutoTable?: { finalY: number };
};

/** Scarica il PDF con nome file impostato (non dipende dalla finestra Stampa). */
export async function downloadSquadsPdf(
  rows: SquadExportRow[],
  courseLabel: string,
  courseCode: string,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;
    const sorted = sortSquadsForExport(rows);
    const exportedAt = new Date().toLocaleString("it-IT");
    const filename = squadsPdfFilename(courseCode);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Elenco squadre — ${courseLabel}`, 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Campo: ${courseCode} · Esportato: ${exportedAt} · Ordine: codice squadra (A→Z)`,
      14,
      26,
    );

    autoTable(doc, {
      startY: 32,
      head: [["Codice squadra", "Nome squadra", "Stato"]],
      body: sorted.map((r) => [
        r.squadCode,
        r.squadName,
        r.isEnabled ? "Attiva" : "Disabilitata",
      ]),
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: {
        fillColor: [238, 238, 238],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      theme: "grid",
    });

    const finalY = (doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? 32;
    doc.text(`Totale squadre: ${sorted.length}`, 14, finalY + 10);

    doc.save(filename);
    return { ok: true, filename };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Errore generazione PDF.",
    };
  }
}
