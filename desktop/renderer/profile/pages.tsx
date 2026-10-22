/** The profile's sub-pages: training cases and battles (the achievements have their own file); a heading, then one card that scrolls inside. */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { shortId } from "../../../src/client/lib/caseState";
import { store as s, matches } from "../store";
import { fmtSolve, fmtTime, shortDate } from "../../../src/client/lib/format";
import { eventLabelOf } from "../../../src/shared/puzzles";
import { Avatar, Choice, Diagram, FOCUS, NUMERIC, PageCard, PageHead, ROW, SearchField, run } from "../ui";
import { TILES } from "../algorithms";
import { ROUNDS, ao5Text, battleRecord, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NoBattles, ResultMark } from "./sections";
import { battles } from "./data";
import { Figures } from "./card";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function TrainingPage({ phone }: { phone: boolean }) {
  const p = s.profile,
    cases: any[] = s.cases(s.profilePuzzle),
    // The desktop's sidebar picks a set (or every one); phones filter by stage.
    set = phone ? undefined : s.allSets(s.profilePuzzle).find((v: any) => v.id === s.profileSet),
    stage = phone ? s.profileStage : "all";
  return (
    <>
      <PageHead title={phone ? tr("Training") : `${said(s.info(s.profilePuzzle)?.label ?? "")} · ${set ? said(set.label) : tr("Every set")}`} />
      <PageCard
        toolbar={
          <>
            {phone && (
              <Choice
                prefix="profileStage:"
                label={tr("Stage")}
                value={s.profileStage}
                options={["all", ...new Set<string>(cases.map((c) => c.stage).filter(Boolean))].map((stage) => ({ id: stage, label: stage === "all" ? "All" : stage }))}
              />
            )}
            <SearchField
              placeholder="Search cases…"
              label="Search cases"
              value={s.query}
              onChange={(query) => {
                s.query = query;
                s.emit();
              }}
              className="ml-auto w-60 max-md:ml-0 max-md:w-full"
            />
          </>
        }
      >
        {s.allSets(s.profilePuzzle).filter((v: any) => !set || v === set).map((set: any) => {
          const chosen = s.setCases(set.id).filter((c: any) => (stage === "all" || stage === c.stage) && matches(c, s.query));
          if (!chosen.length) return null;
          const key = "profile:" + set.id,
            done = chosen.filter((c) => p.cases?.some((v: any) => v.summary?.caseId === c.id)).length,
            closed = s.collapsed.has(key);
          return (
            <section key={key} className="flex flex-col pb-3">
              <button type="button" data-action={"collapse:" + key} onClick={run("collapse:" + key)} className={cn(ROW, "-mx-2 flex h-10 items-center gap-2 px-2 text-sm font-medium")}>
                {closed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                {set.label}
                <span className={cn(NUMERIC, "text-xs font-normal text-muted-foreground")}>
                  {done} / {chosen.length} {tr("trained")}
                </span>
              </button>
              {!closed && (
                <div className={cn(TILES, "pt-1")}>
                  {chosen.map((c) => {
                    const st = p.cases?.find((v: any) => v.summary?.caseId === c.id),
                      open = s.caseDialog === c.id;
                    // The case tiles of the algorithms page: the diagram, then the name and the best time on one line.
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-action={"profileCase:" + c.id}
                        onClick={run("profileCase:" + c.id)}
                        className={cn(
                          "flex aspect-square min-w-0 flex-col rounded-2xl bg-muted/60 px-2 pt-2 pb-1.5 transition-colors [@media(hover:hover)]:hover:bg-muted/80",
                          FOCUS,
                          !st && "opacity-45 hover:opacity-100",
                          open && "bg-accent opacity-100 [@media(hover:hover)]:hover:bg-accent",
                        )}
                      >
                        <span className="flex min-h-0 flex-1 items-center justify-center">
                          <Diagram c={c} size={70} />
                        </span>
                        <span className="flex items-baseline justify-between gap-1.5">
                          <span className="min-w-0 truncate text-xs font-medium">{shortId(c)}</span>
                          <span className={cn(NUMERIC, "shrink-0 text-xs", st ? (s.learned.has(c.id) ? "text-success" : "text-muted-foreground") : "text-muted-foreground/60")}>
                            {st ? fmtTime(st.summary.best) : "–"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </PageCard>
    </>
  );
}

const battleEvent = (b: DuelRecord) => eventLabelOf(b.event);

/** Each opponent with the battles won, lost and drawn against them, the most played first. */
function rivalsOf(list: DuelRecord[]) {
  const by = new Map<string, Record<DuelRecord["result"], number>>();
  for (const b of list) {
    const r = by.get(b.opponent) ?? { win: 0, loss: 0, draw: 0 };
    r[b.result]++;
    by.set(b.opponent, r);
  }
  return [...by].sort((a, b) => b[1].win + b[1].loss + b[1].draw - (a[1].win + a[1].loss + a[1].draw));
}

export function BattlesPage({ phone }: { phone: boolean }) {
  // The desktop lists the opponents beside the battles: one of them shows only theirs.
  const [rival, setRival] = useState(""),
    all = battles(),
    list = rival ? all.filter((b) => b.opponent === rival) : all,
    count = (r: DuelRecord["result"]) => list.filter((b) => b.result === r).length,
    averages = list.map((b) => b.ao5[0]).filter((v): v is number => v != null);
  return (
    <>
      <PageHead title={tr("Battles")} sub={rival} />
      {!all.length ? (
        <PageCard scroll={false}>
          <NoBattles />
        </PageCard>
      ) : (
        <>
          <section aria-label={tr("Summary")}>
            <Figures
              tiles
              figures={[
                [tr("Played"), String(list.length)],
                [tr("Won"), String(count("win")), "good"],
                [tr("Lost"), String(count("loss")), "bad"],
                [tr("Win rate"), Math.round((count("win") / Math.max(1, count("win") + count("loss"))) * 100) + "%", "accent"],
                [tr("Best Ao5"), averages.length ? fmtTime(Math.min(...averages)) : "–", "accent"],
              ]}
            />
          </section>
          <div className={cn("flex min-h-0 flex-1 flex-col", !phone && "grid grid-cols-[17rem_minmax(0,1fr)] gap-4")}>
          {!phone && (
            <PageCard className="gap-1">
              {[["", null] as const, ...rivalsOf(all)].map(([name, r]) => (
                <button key={name} type="button" data-action={"battleRival:" + name} aria-pressed={rival === name} onClick={() => setRival(name)} className={cn(ROW, "flex h-12 w-full shrink-0 items-center gap-3 px-2.5")}>
                  {r ? <Avatar name={name} size={30} className="rounded-[10px]" /> : <span className="size-[30px]" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{r ? name : tr("Every opponent")}</span>
                  <span className={cn(NUMERIC, "text-xs font-semibold text-muted-foreground")}>{r ? `${r.win} – ${r.loss}${r.draw ? ` · ${r.draw}` : ""}` : all.length}</span>
                </button>
              ))}
            </PageCard>
          )}
          <PageCard>
            <Table aria-label={battleRecord(list)}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>{tr("Opponent")}</TableHead>
                  <TableHead>{tr("You")}</TableHead>
                  <TableHead>{tr("Them")}</TableHead>
                  {!phone && <TableHead>{tr("Rounds")}</TableHead>}
                  {!phone && <TableHead className="text-right">{tr("Date")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <ResultMark result={b.result} />
                    </TableCell>
                    <TableCell className="max-w-48">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{b.opponent}</span>
                        <span className="truncate text-xs text-muted-foreground">{phone ? shortDate(b.at) : battleEvent(b)}</span>
                      </div>
                    </TableCell>
                    <TableCell className={cn(NUMERIC, b.result === "win" && "text-success")}>{ao5Text(b.ao5[0])}</TableCell>
                    <TableCell className={cn(NUMERIC, b.result === "loss" && "text-success")}>{ao5Text(b.ao5[1])}</TableCell>
                    {!phone && (
                      <TableCell>
                        <div className={cn(NUMERIC, "grid grid-cols-5 gap-x-4 text-xs")}>
                          {[...Array(ROUNDS).keys()].map((r) => (
                            <span key={r} className="flex flex-col">
                              <span>{b.mine[r] ? fmtSolve(b.mine[r]!.ms, b.mine[r]!.penalty) : "–"}</span>
                              <span className="text-muted-foreground">{b.theirs[r] ? fmtSolve(b.theirs[r]!.ms, b.theirs[r]!.penalty) : "–"}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    )}
                    {!phone && <TableCell className="text-right text-xs text-muted-foreground">{shortDate(b.at)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageCard>
          </div>
        </>
      )}
    </>
  );
}
