export function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggleRow">
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} disabled={disabled}>
        <span />
      </button>
    </div>
  );
}
