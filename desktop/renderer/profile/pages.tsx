/** The profile's sub-pages: training cases, achievements and battles; a heading, then one card that scrolls inside. */
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { shortId } from "../../../src/client/lib/caseState";
import { store as s, matches } from "../store";
import { fmtSolve, fmtTime, shortDate } from "../../../src/client/lib/format";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { Back, Bar, Choice, Diagram, Empty, FOCUS, Figure, Icon, NUMERIC, PageCard, PageHead, PuzzleButton, ROW, SearchField, SectionHead, SelectMenu, Stats, Strip, run, plural } from "../ui";
import { TILES } from "../algorithms";
import { ROUNDS, ao5Text, battleRecord, type DuelRecord } from "../duelClient";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AchievementMark, NoBattles, ResultMark } from "./sections";
import { battles } from "./data";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

export function TrainingPage({ phone }: { phone: boolean }) {
  const p = s.profile,
    cases: any[] = s.cases(s.profilePuzzle),
    learned = cases.filter((c) => s.learned.has(c.id)).length,
    trained = p.cases?.length ?? 0;
  return (
    <>
      <PageHead
        title={tr("Training")}
        sub={tr("{0} of {1} trained · {2} learned", { 0: trained, 1: cases.length, 2: learned })}
        lead={!phone && <Back action="profileMode:overview" label="Back to the profile" />}
      >
        {!phone && <PuzzleButton profile />}
      </PageHead>
      <PageCard
        toolbar={
          <>
            <Choice
              prefix="profileStage:"
              label={tr("Stage")}
              value={s.profileStage}
              options={["all", ...new Set<string>(cases.map((c) => c.stage).filter(Boolean))].map((stage) => ({ id: stage, label: stage === "all" ? "All" : stage }))}
            />
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
        {s.allSets(s.profilePuzzle).map((set: any) => {
          const chosen = cases.filter((c) => c.set === set.id && (s.profileStage === "all" || s.profileStage === c.stage) && matches(c, s.query));
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
                      open = s.overlay === "profileCase" && s.caseId === c.id;
                    // The case tiles of the algorithms page: the diagram, then the name and the best time on one line.
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-action={"profileCase:" + c.id}
                        onClick={run("profileCase:" + c.id)}
                        className={cn(
                          "flex aspect-square min-w-0 flex-col rounded-lg bg-muted/45 px-2 pt-2 pb-1.5 transition-colors [@media(hover:hover)]:hover:bg-muted/80",
                          FOCUS,
                          !st && "opacity-45 hover:opacity-100",
                          open && "bg-muted opacity-100 ring-1 ring-primary/70",
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
      <PageHead title={tr("Achievements")} sub={tr("{0} of {1} unlocked", { 0: unlocked, 1: total })} lead={!phone && <Back action="profileMode:overview" label="Back to the profile" />} />
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
              label={tr("Filter")}
              value={s.achievementFilter}
              options={[
                { id: "all", label: tr("All") },
                { id: "unlocked", label: tr("Unlocked") },
                { id: "locked", label: tr("Locked") },
              ]}
            />
            <div className="ml-auto flex w-48 items-center gap-3 max-md:hidden">
              <Bar ratio={total ? unlocked / total : 0} className="flex-1" />
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{Math.round((total ? unlocked / total : 0) * 100)}%</span>
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
                <SectionHead
                  title={
                    <span className="flex items-center gap-2">
                      {members[0].puzzle && <Icon name={"Puzzle" + members[0].puzzle} size={16} className="text-muted-foreground" />}
                      {said(group)}
                    </span>
                  }
                  meta={`${members.filter((a) => a.unlocked).length} / ${members.length}`}
                />
                <div className="grid gap-x-8 gap-y-1 lg:grid-cols-2">
                  {visible.map((a) => (
                    <div key={a.id} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5">
                      <AchievementMark a={a} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={cn("truncate text-sm font-medium", !a.unlocked && "text-foreground/80")}>{said(a.title)}</span>
                          <span className={cn(NUMERIC, "shrink-0 text-xs text-muted-foreground")}>{a.unlockedAt ? shortDate(a.unlockedAt) : said(a.detail)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{said(a.description)}</p>
                        {!a.unlocked && <Bar ratio={a.ratio} fill="bg-primary/70" />}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        {!shown && <Empty icon={Trophy} title={s.achievementFilter === "unlocked" ? tr("Nothing unlocked here yet. Keep practising!") : tr("Everything here is unlocked.")} />}
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
      <PageHead title={tr("Battles")} sub={list.length ? plural(list.length, "battle") : undefined} lead={!phone && <Back action="profileMode:overview" label="Back to the profile" />} />
      {!list.length ? (
        <PageCard scroll={false}>
          <NoBattles />
        </PageCard>
      ) : (
        <>
          <Strip label="Summary">
            <Stats columns={5}>
              <Figure caption="plain" size="xl" label={tr("Played")} value={String(list.length)} />
              <Figure caption="plain" size="xl" label={tr("Won")} value={String(count("win"))} tone="good" />
              <Figure caption="plain" size="xl" label={tr("Lost")} value={String(count("loss"))} />
              <Figure caption="plain" size="xl" label={tr("Win rate")} value={Math.round((count("win") / Math.max(1, count("win") + count("loss"))) * 100) + "%"} />
              <Figure caption="plain" size="xl" label={tr("Best Ao5")} value={averages.length ? fmtTime(Math.min(...averages)) : "–"} tone="accent" />
            </Stats>
          </Strip>
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
        </>
      )}
    </>
  );
}
