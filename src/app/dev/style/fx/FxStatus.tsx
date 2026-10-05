"use client";

/**
 * The fx page's live readout and controls (fixture chrome, not app UI): each
 * slot's state (fallback / live / held), the runtime's status() when it has
 * loaded, and the debug hooks (§6.8): lose a context (counted or not),
 * restore it, and reset this session's AMBIENT budget and WAIT pause.
 * ?shd=lost loses the first live context once, uncounted.
 */
import { useEffect, useState } from "react";

interface ShaderDebug {
  status(): { supported: boolean | null; highp: boolean | null; live: number; running: string[]; degraded: boolean; countedLosses: number };
  lose(o?: { counted?: boolean }): void;
  restore(): void;
  readonly frames: number;
}

const dbg = () => (window as Window & { __xtnlShader?: ShaderDebug }).__xtnlShader ?? null;

interface Row {
  id: string;
  state: string;
}

export function FxStatus({ autoLose }: { autoLose: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [rt, setRt] = useState("runtime not loaded");
  useEffect(() => {
    let lostOnce = false;
    const read = () => {
      const slots = [...document.querySelectorAll<HTMLElement>(".shd[data-shd]")];
      setRows(
        slots.map((el, i) => ({
          id: el.id || `${el.dataset.shd}-${i}`,
          state: el.hasAttribute("data-shd-hold") ? "held" : (el.dataset.shdState ?? "fallback"),
        }))
      );
      const d = dbg();
      if (!d) return;
      const s = d.status();
      setRt(`supported ${String(s.supported)} · highp ${String(s.highp)} · live ${s.live} · running ${s.running.join(", ") || "none"} · degraded ${s.degraded} · counted losses ${s.countedLosses} · frames ${d.frames}`);
      if (autoLose && !lostOnce && s.running.length) {
        lostOnce = true;
        d.lose({ counted: false });
      }
    };
    read();
    const t = window.setInterval(read, 250);
    return () => window.clearInterval(t);
  }, [autoLose]);
  const reset = () => {
    try {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith("xtnl:fx:")) sessionStorage.removeItem(k);
    } catch {
      /* private mode */
    }
    window.location.reload();
  };
  return (
    <div className="card sg-spec" data-fx-status>
      <div className="sec-h">
        <h2>Slots</h2>
      </div>
      <ul className="fxp-list">
        {rows.map((r) => (
          <li key={r.id}>
            <b>{r.id}</b> · {r.state}
          </li>
        ))}
      </ul>
      <p className="sg-log" aria-live="off">
        {rt}
      </p>
      <div className="sg-row">
        <button type="button" className="btn-secondary" onClick={() => dbg()?.lose({ counted: false })}>
          Lose context
        </button>
        <button type="button" className="btn-secondary" onClick={() => dbg()?.lose({ counted: true })}>
          Lose (counted)
        </button>
        <button type="button" className="btn-secondary" onClick={() => dbg()?.restore()}>
          Restore
        </button>
        <button type="button" className="btn-secondary" onClick={reset}>
          Reset 5 s budget
        </button>
      </div>
    </div>
  );
}
