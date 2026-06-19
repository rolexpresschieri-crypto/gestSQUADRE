import { Fragment } from "react";
import { getAlarmRequestParts } from "@/lib/squad-alarms";
import styles from "./squad-alarm-detail.module.css";

type AlarmDetailRow = {
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
};

export function SquadAlarmRequestDetail({ row }: { row: AlarmDetailRow }) {
  const parts = getAlarmRequestParts(row);
  if (parts.length === 0) {
    return (
      <span>
        {row.message?.trim() || "Richiesta intervento TOC da squadra"}
      </span>
    );
  }

  return (
    <span className={styles.alarmFlags}>
      {parts.map((part, index) => (
        <Fragment key={part.code}>
          {index > 0 ? <span className={styles.sep}> · </span> : null}
          {part.variant === "legacy_highlight" ? (
            <span className={styles.flagHighlight}>{part.label}</span>
          ) : (
            <span>{part.label}</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}
