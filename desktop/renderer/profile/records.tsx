/** The personal records of every event timed, a WCA profile's table: a row per event, the chosen one drives the rest of the profile. */
import { store as s } from "../store";
import { fmtTime, shortDate } from "../../../src/client/lib/format";
import { Icon, NUMERIC, run } from "../ui";
import { cn } from "@/lib/utils";
import { Section } from "./card";
import type { ProfileData } from "./data";

const COLUMNS: [string, "best" | "bestAo5" | "bestAo12" | "bestAo100"][] = [
  ["Single", "best"],
  ["Ao5", "bestAo5"],
  ["Ao12", "bestAo12"],
  ["Ao100", "bestAo100"],
];

export function RecordsSection({ d, phone = false, className }: { d: ProfileData; phone?: boolean; className?: string }) {
  const current = s.event(s.profilePuzzle, s.profileSolveMode).id,
    columns = phone ? COLUMNS.slice(0, 3) : COLUMNS,
        // Ao100 only where the table has room for it.
    grid = phone ? "grid-cols-[minmax(0,1fr)_repeat(3,4rem)]" : "grid-cols-[minmax(0,1fr)_repeat(3,4.75rem)_3.5rem] 2xl:grid-cols-[minmax(0,1fr)_repeat(4,5rem)_3.5rem]",
    wide = (key: string) => key === "bestAo100" && "max-2xl:hidden";
  return (
    <Section label="Personal records" title="Personal records" meta={d.records.length ? "Standard scrambles" : undefined} className={className} body="min-h-0 flex-1 gap-0 px-3 pt-0 pb-3">
      {!d.records.length ? (
        <p className="flex flex-1 items-center justify-center py-4 text-center text-sm text-muted-foreground">Your records appear here after your first timed solve.</p>
      ) : (
        <div className="flex min-h-0 flex-col" role="table" aria-label="Personal records">
          <div role="row" className={cn("grid h-8 shrink-0 items-center gap-2 px-2 text-xs text-muted-foreground", grid)}>
            <span role="columnheader">Event</span>
            {columns.map(([label, key]) => (
              <span key={label} role="columnheader" className={cn("text-right", wide(key))}>
                {label}
              </span>
            ))}
            {!phone && (
              <span role="columnheader" className="text-right">
                Solves
              </span>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto" role="rowgroup">
            {d.records.map((r) => {
              const chosen = r.event === current;
              return (
                <button
                  key={r.event}
                  type="button"
                  role="row"
                  aria-selected={chosen}
                  data-action={"profilePuzzle:" + r.event}
                  onClick={run("profilePuzzle:" + r.event)}
                  title={r.lastAt ? `Last solve ${shortDate(r.lastAt)}` : undefined}
                  className={cn(
                    "grid h-11 w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
                    grid,
                    chosen && "bg-muted hover:bg-muted",
                  )}
                >
                  <span role="cell" className={cn("flex min-w-0 items-center gap-2.5 text-sm", chosen ? "font-medium text-foreground" : "text-muted-foreground")}>
                    <Icon name={"Puzzle" + r.event} size={18} className={chosen ? "text-primary" : undefined} />
                    <span className="truncate">{s.event(r.puzzle, r.solveMode).label}</span>
                  </span>
                  {columns.map(([label, key]) => (
                    <span
                      key={label}
                      role="cell"
                      className={cn(NUMERIC, "text-right text-sm", wide(key), r[key] == null ? "text-muted-foreground/50" : key === "best" ? "font-medium text-foreground" : "text-foreground/85")}
                    >
                      {r[key] == null ? "–" : fmtTime(r[key])}
                      {/* A best given at setup, not yet beaten on Qbix. */}
                      {key === "best" && r.declared && (
                        <span title="Your best before Qbix, given at setup" className="ml-0.5 align-super text-[10px] text-muted-foreground">
                          *
                        </span>
                      )}
                    </span>
                  ))}
                  {!phone && (
                    <span role="cell" className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>
                      {r.count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
