import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { memo, useEffect, useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import { type CaseDto, type SetDto } from "../../shared/types";
import { routeAtom } from "../state";
import { IconCheck, IconMinus } from "./icons";
import { CaseDiagram } from "./CaseDiagram";

const selectorExpansion = new Map<string, Record<string, boolean>>();

interface Props {
  cases: CaseDto[];
  sets: SetDto[];
  selected: string[];
  onChange: (ids: string[]) => void;
  defaultExpanded?: boolean;
}

function Checkbox({ state }: { state: "on" | "off" | "partial" }) {
  return <span className={`checkbox ${state}`}>{state === "on" ? <IconCheck /> : state === "partial" ? <IconMinus /> : null}</span>;
}

/** "F2L 12" → "12", "PLL T" → "T", "2L-OLL Sune" → "Sune" */
const shortId = (c: CaseDto) => c.id.replace(/^\S+\s+/, "");

export const CaseSelector = memo(function CaseSelector({ cases, sets, selected, onChange, defaultExpanded = false }: Props) {
  const [query, setQuery] = useState("");
  const selectorKey = sets.map(s => s.id).join(":");
  const [open, setOpen] = useState<Record<string, boolean>>(() => selectorExpansion.get(selectorKey) ?? {});
  useEffect(() => { selectorExpansion.set(selectorKey, open); }, [selectorKey, open]);
  const scrollRef = usePreservedScroll(`case-selector:${selectorKey}:${query}`);
  const setRoute = useSetAtom(routeAtom);
  const sel = useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();

  const toggleCase = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  const toggleSet = (ids: string[]) => {
    const all = ids.every((id) => sel.has(id));
    const next = new Set(sel);
    for (const id of ids) all ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="muted">{selected.length} selected</span>
        {selected.length > 0 && <button className="mini-btn" onClick={() => onChange([])}>Clear</button>}
      </div>
      <input className="input" aria-label="Search cases" placeholder="Search cases…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="panel-body" ref={scrollRef}>
        {[...new Set(sets.map(s => s.stage))].map((stage) => (
          <div key={stage}>
            <div className="stage-label">{stage}</div>
            {sets
              .filter((s) => s.stage === stage)
              .map((s) => {
                const list = cases.filter((c) => c.set === s.id && (!q || c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)));
                if (!list.length) return null;
                const ids = list.map((c) => c.id);
                const count = ids.filter((id) => sel.has(id)).length;
                const state = count === 0 ? "off" : count === ids.length ? "on" : "partial";
                const isOpen = open[s.id] ?? (defaultExpanded || !!q || count > 0);
                return (
                  <div key={s.id} className="selector-set">
                    <div className="selector-set-controls">
                      <button className="selector-check-button" role="checkbox" aria-label={`Select all ${s.label} cases`}
                        aria-checked={state === "partial" ? "mixed" : state === "on"} onClick={() => toggleSet(ids)}>
                        <Checkbox state={state} />
                      </button>
                      <button className="selector-set-header" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [s.id]: !isOpen })}>
                        <span>{s.label}</span>
                        <span className="count">{count}/{ids.length}</span>
                        <span className="selector-chevron" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="selector-grid">
                        {list.map((c) => {
                          const on = sel.has(c.id);
                          return (
                            <button
                              key={c.id}
                              className={`selector-tile ${on ? "on" : ""}`}
                              onClick={() => toggleCase(c.id)}
                              onContextMenu={(event) => { event.preventDefault(); setRoute({ page: "algorithms", caseId: c.id }); }}
                              title={c.name !== c.id ? `${c.id} · ${c.name}` : c.id}
                              aria-label={`${c.id}${c.name !== c.id ? `, ${c.name}` : ""}`}
                              aria-pressed={on}
                            >
                              <CaseDiagram c={c} size={58} />
                              <span className="tile-id">{shortId(c)}</span>
                              {on && <span className="tile-check"><IconCheck /></span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
});
