/** The profile's sub-pages: training cases, achievements and battles; a heading, then one card that scrolls inside. */
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { shortId } from "../../../src/client/lib/caseState";
import { store as s, matches } from "../store";
import { fmtSolve, fmtTime, plural, shortDate } from "../../../src/client/lib/format";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { Bar, Choice, Diagram, Empty, Figure, Icon, MONO, PuzzleButton, SelectMenu, run } from "../ui";
import { ROUNDS, ao5Text, battleRecord, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageCard, Stats, SubPageHead } from "./card";
import { Badge, NoBattles, ResultMark } from "./sections";
import { battles } from "./data";

export function TrainingPage({ phone }: { phone: boolean }) {
  const p = s.profile,
    cases: any[] = s.cases(s.profilePuzzle),
    learned = cases.filter((c) => s.learned.has(c.id)).length,
    trained = p.cases?.length ?? 0;
  return (
    <>
      <SubPageHead title="Training" meta={`${trained} of ${cases.length} trained · ${learned} learned`} back={!phone}>
        {!phone && <PuzzleButton profile />}
      </SubPageHead>
      <PageCard
        toolbar={
          <>
            <Choice
              prefix="profileStage:"
              label="Stage"
              value={s.profileStage}
              options={["all", ...new Set<string>(cases.map((c) => c.stage).filter(Boolean))].map((stage) => ({ id: stage, label: stage === "all" ? "All" : stage }))}
            />
            <InputGroup className="ml-auto w-60 max-md:ml-0 max-md:w-full">
              <InputGroupInput
                placeholder="Search cases…"
                aria-label="Search cases"
                value={s.query}
                onChange={(e) => {
                  s.query = e.target.value;
                  s.emit();
                }}
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
          </>
        }
      >
        {s.allSets(s.profilePuzzle).map((set: any) => {
          const chosen = cases.filter((c) => c.set === set.id && (s.profileStage === "all" || s.profileStage === c.stage) && matches(c, s.query));
          if (!chosen.length) return null;
          const key = "profile:" + set.id,
            done = chosen.filter((c) => p.cases?.some((v: any) => v.summary?.caseId === c.id)).length,
            closed = s.collapsed.has(key);
          return (
            <section key={key} className="flex flex-col pb-3">
              <button
                type="button"
                data-action={"collapse:" + key}
                onClick={run("collapse:" + key)}
                className="-mx-2 flex h-10 items-center gap-2 rounded-md px-2 text-left text-sm font-medium outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                {closed ? <ChevronRight className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                {set.label}
                <span className={cn(MONO, "text-xs font-normal text-muted-foreground")}>
                  {done} / {chosen.length} trained
                </span>
              </button>
              {!closed && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-1 pt-1">
                  {chosen.map((c) => {
                    const st = p.cases?.find((v: any) => v.summary?.caseId === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-action={"profileCase:" + c.id}
                        onClick={run("profileCase:" + c.id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg px-1 pt-3 pb-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
                          !st && "opacity-45 hover:opacity-100",
                        )}
                      >
                        <Diagram c={c} size={64} />
                        <span className="max-w-full truncate text-xs font-medium">{shortId(c)}</span>
                        <span className={cn(MONO, "text-xs", st ? (s.learned.has(c.id) ? "text-primary" : "text-foreground") : "text-muted-foreground")}>
                          {st ? fmtTime(st.summary.best) : "–"}
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

export function AchievementsPage({ phone }: { phone: boolean }) {
  const items: any[] = s.achievements?.achievements ?? [],
    // The profile's puzzle first, then the others in their order.
    groups = ([...new Set(items.map((a) => a.group))] as string[]).sort(
      (a, b) => Number(items.find((v) => v.group === b)?.puzzle === s.profilePuzzle) - Number(items.find((v) => v.group === a)?.puzzle === s.profilePuzzle),
    ),
    unlocked = s.achievements?.unlocked ?? 0,
    total = s.achievements?.total ?? 0;
  let shown = 0;
  return (
    <>
      <SubPageHead title="Achievements" meta={`${unlocked} of ${total} unlocked`} back={!phone} />
      <PageCard
        toolbar={
          <>
            <SelectMenu
              action="achievementGroup"
              value={s.achievementGroup}
              align="start"
              variant="outline"
              options={[{ id: "all", label: "All puzzles" }, ...groups.map((id) => ({ id, label: id }))]}
            />
            <Choice
              prefix="achievementFilter:"
              label="Filter"
              value={s.achievementFilter}
              options={["all", "unlocked", "locked"].map((f) => ({ id: f, label: f[0]!.toUpperCase() + f.slice(1) }))}
            />
            <div className="ml-auto flex w-48 items-center gap-3 max-md:hidden">
              <Bar ratio={total ? unlocked / total : 0} className="h-1.5 flex-1" />
              <span className={cn(MONO, "text-xs text-muted-foreground")}>{Math.round((total ? unlocked / total : 0) * 100)}%</span>
            </div>
          </>
        }
      >
        {groups
          .filter((group) => s.achievementGroup === "all" || s.achievementGroup === group)
          .map((group) => {
            const members = items.filter((a) => a.group === group),
              visible = members.filter((a) => s.achievementFilter === "all" || a.unlocked === (s.achievementFilter === "unlocked"));
            shown += visible.length;
            if (!visible.length) return null;
            return (
              <section className="flex flex-col gap-1 pb-5" key={group}>
                <div className="flex h-10 items-center gap-2">
                  {members[0].puzzle && <Icon name={"Puzzle" + members[0].puzzle} size={16} className="text-muted-foreground" />}
                  <h2 className="text-sm font-semibold">{group}</h2>
                  <span className={cn(MONO, "text-xs text-muted-foreground")}>
                    {members.filter((a) => a.unlocked).length} / {members.length}
                  </span>
                </div>
                <div className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
                  {visible.map((a) => (
                    <div key={a.id} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5">
                      <Badge a={a} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={cn("truncate text-sm font-medium", !a.unlocked && "text-foreground/80")}>{a.title}</span>
                          <span className={cn(MONO, "shrink-0 text-xs text-muted-foreground")}>{a.unlockedAt ? shortDate(a.unlockedAt) : a.detail}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                        {!a.unlocked && (
                          <Bar ratio={a.ratio} fill="bg-primary/70" className="mt-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        {!shown && <Empty>{s.achievementFilter === "unlocked" ? "Nothing unlocked here yet. Keep practising!" : "Everything here is unlocked."}</Empty>}
      </PageCard>
    </>
  );
}

const battleEvent = (b: DuelRecord) => {
  const e = eventInfo(b.event);
  return e ? eventLabel(e.puzzle, e.solveMode) : b.event;
};

export function BattlesPage({ phone }: { phone: boolean }) {
  const list = battles(),
    count = (r: DuelRecord["result"]) => list.filter((b) => b.result === r).length,
    averages = list.map((b) => b.ao5[0]).filter((v): v is number => v != null);
  return (
    <>
      <SubPageHead title="Battles" meta={list.length ? plural(list.length, "battle") : undefined} back={!phone} />
      {!list.length ? (
        <PageCard>
          <NoBattles />
        </PageCard>
      ) : (
        <>
          <Card className="shrink-0 gap-0 px-5 py-4">
            <Stats columns={5}>
              <Figure caption="plain" size="xl" label="Played" value={String(list.length)} />
              <Figure caption="plain" size="xl" label="Won" value={String(count("win"))} tone="good" />
              <Figure caption="plain" size="xl" label="Lost" value={String(count("loss"))} />
              <Figure caption="plain" size="xl" label="Win rate" value={Math.round((count("win") / Math.max(1, count("win") + count("loss"))) * 100) + "%"} />
              <Figure caption="plain" size="xl" label="Best Ao5" value={averages.length ? fmtTime(Math.min(...averages)) : "–"} tone="accent" />
            </Stats>
          </Card>
          <PageCard>
            <Table aria-label={battleRecord(list)}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-muted-foreground" />
                  <TableHead className="text-xs text-muted-foreground">Opponent</TableHead>
                  <TableHead className="text-xs text-muted-foreground">You</TableHead>
                  <TableHead className="text-xs text-muted-foreground">Them</TableHead>
                  {!phone && <TableHead className="text-xs text-muted-foreground">Rounds</TableHead>}
                  {!phone && <TableHead className="text-right text-xs text-muted-foreground">Date</TableHead>}
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
                    <TableCell className={cn(MONO, b.result === "win" && "text-success")}>{ao5Text(b.ao5[0])}</TableCell>
                    <TableCell className={cn(MONO, b.result === "loss" && "text-success")}>{ao5Text(b.ao5[1])}</TableCell>
                    {!phone && (
                      <TableCell>
                        <div className={cn(MONO, "grid grid-cols-5 gap-x-4 text-xs")}>
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
        </>
      )}
    </>
  );
}
