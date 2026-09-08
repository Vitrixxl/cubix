import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPortalTarget } from "./FloatingSheet";
import { useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { STAGES, type CaseDto, type SetDto } from "../../shared/types";
import { routeAtom } from "../state";
import { IconCheck, IconGrid, IconMinus } from "./icons";
import { usePopoverMotion } from "../hooks/usePopoverMotion";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { caseState, maskForStage } from "../lib/caseState";

interface Props {
  cases: CaseDto[];
  sets: SetDto[];
  selected: string[];
  onChange: (ids: string[]) => void;
  defaultExpanded?: boolean;
}

function Checkbox({ state }: { state: "on" | "off" | "partial" }) {
  return (
    <motion.span className={`checkbox ${state}`}>
      <AnimatePresence mode="wait" initial={false}>
        {state !== "off" && (
          <motion.span
            key={state}
            className="checkbox-icon"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 520, damping: 30 }}
          >
            {state === "on" ? <IconCheck /> : <IconMinus />}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

/** "F2L 12" → "12", "PLL T" → "T", "2L-OLL Sune" → "Sune" */
const shortId = (c: CaseDto) => c.id.replace(/^\S+\s+/, "");

const gridVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.01, delayChildren: 0.025 } },
};
const tileVariants = {
  hidden: { opacity: 0, y: 7 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const } },
};

interface ContextMenu {
  c: CaseDto;
  x: number;
  y: number;
  above: boolean;
}

const MENU_WIDTH = 220;

export const CaseSelector = memo(function CaseSelector({ cases, sets, selected, onChange, defaultExpanded = false }: Props) {
  const portalTarget = useFloatingPortalTarget();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const menuMotion = usePopoverMotion(menu?.above ?? false, "left");
  const menuRef = useRef<HTMLDivElement>(null);
  const setRoute = useSetAtom(routeAtom);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    const frame = window.setTimeout(() => menuRef.current?.querySelector("button")?.focus(), 0);
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const openMenu = (event: React.MouseEvent, c: CaseDto) => {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.max(8, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8));
    const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 8));
    setMenu({ c, x, y, above: y > window.innerHeight / 2 });
  };
  const openCasePage = () => {
    if (!menu) return;
    setRoute({ page: "algorithms", caseId: menu.c.id });
    setMenu(null);
  };
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
        <h2>Cases</h2>
        <motion.span key={selected.length} className="muted" style={{ fontSize: 12 }} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }}>
          {selected.length} selected
        </motion.span>
      </div>
      <div style={{ padding: "0 4px 8px" }}>
        <input className="input" aria-label="Search cases" placeholder="Search cases…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="panel-body">
        {STAGES.map((stage) => (
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
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div key="grid" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: "hidden" }}>
                          <motion.div className="selector-grid" variants={gridVariants} initial="hidden" whileInView="show" viewport={{ once: true }}>
                            {list.map((c) => {
                              const on = sel.has(c.id);
                              return (
                                <motion.button
                                  key={c.id}
                                  className={`selector-tile ${on ? "on" : ""}`}
                                  onClick={() => toggleCase(c.id)}
                                  onContextMenu={(event) => openMenu(event, c)}
                                  title={c.name !== c.id ? `${c.id} · ${c.name}` : c.id}
                                  aria-label={`${c.id}${c.name !== c.id ? `, ${c.name}` : ""}`}
                                  aria-pressed={on}
                                  variants={tileVariants}
                                  transition={{ type: "spring", stiffness: 480, damping: 34 }}
                                >
                                  <AnimatePresence initial={false}>
                                    {on && (
                                      <motion.span
                                        className="selector-tile-selection"
                                        initial={{ opacity: 0, scale: 0.82 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 34 }}
                                      />
                                    )}
                                  </AnimatePresence>
                                  <StaticCubeSvg state={caseState(c)} size={58} mask={maskForStage(c.stage)} />
                                  <span className="tile-id">{shortId(c)}</span>
                                  <AnimatePresence initial={false}>
                                    {on && (
                                      <motion.span
                                        className="tile-check"
                                        initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
                                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                        exit={{ opacity: 0, scale: 0.4, rotate: 16 }}
                                        transition={{ type: "spring", stiffness: 560, damping: 30 }}
                                      >
                                        <IconCheck />
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                </motion.button>
                              );
                            })}
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {createPortal(<AnimatePresence>{menu &&
        <motion.div {...menuMotion} transformTemplate={(_, transform) => `translateY(${menu.above ? "-100%" : "0"}) ${transform === "none" ? "" : transform}`} data-placement={menu.above ? "top" : "bottom"} ref={menuRef} className="case-context-menu" role="menu" aria-label={menu.c.id} style={{ left: menu.x, top: menu.y, maxHeight: menu.above ? menu.y - 8 : window.innerHeight - menu.y - 8, overflowY: "auto" }} onContextMenu={(event) => event.preventDefault()}>
          <div className="case-context-menu-title">
            <strong>{menu.c.id}</strong>
            {menu.c.name !== menu.c.id && <span className="muted">{menu.c.name}</span>}
          </div>
          <button type="button" role="menuitem" className="case-context-menu-item" onClick={openCasePage}>
            <IconGrid />
            Open case page
          </button>
        </motion.div>}</AnimatePresence>,
        portalTarget,
      )}
    </div>
  );
});
