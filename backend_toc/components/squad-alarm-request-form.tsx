"use client";

import { SQUAD_ALARM_REQUEST_ORDER, SQUAD_ALARM_REQUEST_LABELS } from "@/lib/squad-alarms";
import styles from "./squad-alarm-request-form.module.css";

export type SquadAlarmRequestFormValue = {
  requestTypes: Record<string, boolean>;
  otherDetail: string;
};

export const emptySquadAlarmRequestForm = (): SquadAlarmRequestFormValue => ({
  requestTypes: Object.fromEntries(SQUAD_ALARM_REQUEST_ORDER.map((code) => [code, false])),
  otherDetail: "",
});

export function squadAlarmRequestTypesFromForm(
  form: SquadAlarmRequestFormValue,
): string[] {
  return SQUAD_ALARM_REQUEST_ORDER.filter((code) => form.requestTypes[code]);
}

type Props = {
  value: SquadAlarmRequestFormValue;
  onChange: (next: SquadAlarmRequestFormValue) => void;
  disabled?: boolean;
};

export function SquadAlarmRequestForm({ value, onChange, disabled }: Props) {
  const showAltro = Boolean(value.requestTypes.altro);

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Stesso modulo dell&apos;app mobile: seleziona una o più richieste per il TOC.
      </p>
      <div className={styles.grid}>
        {SQUAD_ALARM_REQUEST_ORDER.map((code) => (
          <label key={code} className={styles.check}>
            <input
              type="checkbox"
              checked={Boolean(value.requestTypes[code])}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  requestTypes: { ...value.requestTypes, [code]: e.target.checked },
                })
              }
            />
            {SQUAD_ALARM_REQUEST_LABELS[code] ?? code}
          </label>
        ))}
      </div>
      {showAltro ? (
        <label className={styles.altroField}>
          Dettaglio «Altro»
          <textarea
            rows={2}
            value={value.otherDetail}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, otherDetail: e.target.value })}
            placeholder="Descrivi brevemente…"
          />
        </label>
      ) : null}
    </div>
  );
}
