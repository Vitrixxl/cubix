/** The personal setup (level, puzzles learned and known) and the personal goals, each one card of the profile. */
import { useState } from "react";
import { Check, Pencil, Plus, Route, Target, Trash2 } from "lucide-react";
import { store as s, catalog } from "../store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROFILE_KEY, goalTitle, journeyProfile } from "../../../src/client/lib/journey";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { localDay } from "../../../src/client/lib/dailyLearning";
import { METHODS } from "../../../src/shared/methods";
import { Bar } from "../ui";
import { Section } from "./card";

/** A puzzle and the methods chosen for it, as one badge: "4×4 · Yau". */
function PuzzleBadges({ puzzles, methods, empty }: { puzzles: readonly PuzzleId[]; methods?: Partial<Record<PuzzleId, string[]>>; empty: string }) {
  if (!puzzles.length) return <span className="text-sm text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {puzzles.map((p) => {
        const names = (methods?.[p] ?? []).map((id) => METHODS[p].find((m) => m.id === id)?.name).filter(Boolean);
        return (
          <Badge key={p} variant="secondary" className="h-6 font-normal">
            <span className="font-medium">{puzzleInfo(p).label}</span>
            {!!names.length && <span className="text-muted-foreground">· {names.join(", ")}</span>}
          </Badge>
        );
      })}
    </div>
  );
}

/** The puzzles that can be solved, and those whose course has begun; the setup can be redone, and the tour replayed, from here. */
export function PersonalInfo({ className }: { className?: string }) {
  const profile = journeyProfile(s.journey),
    learning = (Object.keys(s.course.methods) as PuzzleId[]).filter((p) => !profile?.knownPuzzles.includes(p)),
    methods = Object.fromEntries(learning.map((p) => [p, [s.course.methods[p]!]]));
  return (
    <Section
      label="Personal setup"
      title="Your journey"
      className={className}
      body="gap-4"
    >
      {profile ? (
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <dt className="text-xs text-muted-foreground">Learning</dt>
            <dd>
              <PuzzleBadges puzzles={learning} methods={methods} empty="Nothing yet" />
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-xs text-muted-foreground">Can solve</dt>
            <dd>
              <PuzzleBadges puzzles={profile.knownPuzzles} methods={profile.knownMethods} empty="None yet" />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Tell us the puzzles you can already solve.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" data-action="onboarding" onClick={() => void s.action("onboarding")}>
          <Pencil />
          {profile ? "Edit setup" : "Set up"}
        </Button>
        <Button variant="outline" size="sm" data-action="tour" onClick={() => void s.action("tour")}>
          <Route />
          Replay tour
        </Button>
      </div>
    </Section>
  );
}

/** Personal goals are global to the account, independent of the profile's statistics filters. */
export function PersonalGoals({ className }: { className?: string }) {
  const profile = journeyProfile(s.journey),
    goals = s.personalGoals;
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const edit = (key = "") => {
    s.editGoalKey = key;
    s.overlay = "personalGoal";
    s.emit();
  };
  const change = async (key: string, values: Parameters<typeof s.updateJourney>[0]) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await s.updateJourney(values);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const done = goals.filter((g) => g.progress.complete).length;
  return (
    <div data-tour="profile-goals" className={cn("flex min-h-0 flex-col", className)}>
      <Section
        label="Personal goals"
        title="Goals"
        meta={goals.length ? `${done} of ${goals.length} reached` : undefined}
        aside={
          <Button variant="ghost" size="sm" data-action="goal:add" onClick={() => edit()} className="-mr-2 text-muted-foreground hover:text-foreground">
            <Plus />
            Add goal
          </Button>
        }
        className="min-h-0 flex-1"
        body="min-h-0 flex-1 gap-0 overflow-y-auto px-3 pt-1 pb-3"
      >
        {!goals.length && <p className="px-2 pb-2 text-sm text-muted-foreground">No goal yet: a target time or a set to learn keeps you going.</p>}
        {goals.map(({ key, goal, progress }) => {
          const title = goalTitle(goal, catalog.sets),
            late = !!goal.dueDate && goal.dueDate < localDay() && !progress.complete;
          return (
            <article
              key={key}
              aria-label={title}
              data-complete={progress.complete || undefined}
              className="group/goal flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                  progress.complete ? "bg-success/15 text-success" : "bg-primary/12 text-primary",
                )}
              >
                {progress.complete ? <Check className="size-4" /> : <Target className="size-4" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
                    {title}
                  </h3>
                  <div className="-my-1 flex shrink-0 opacity-0 transition-opacity group-hover/goal:opacity-100 group-focus-within/goal:opacity-100 [@media(hover:none)]:opacity-100">
                    <Button size="icon-xs" variant="ghost" aria-label={`Edit ${title}`} disabled={!!busy} onClick={() => edit(key)}>
                      <Pencil />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`Delete ${title}`} disabled={!!busy} onClick={() => void change(key, { [key]: null })}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Bar
                  ratio={progress.ratio}
                  fill={progress.complete ? "bg-success" : "bg-primary"}
                  className="h-1"
                  label={title}
                  text={progress.detail}
                />
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {progress.complete ? "Reached · " : ""}
                    {progress.detail}
                  </span>
                  {goal.dueDate && (
                    <time dateTime={goal.dueDate} className={cn("ml-auto shrink-0", late && "text-warning")}>
                      {late ? "Overdue · " : "Due "}
                      {new Date(goal.dueDate + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                  )}
                </div>
                {goal.kind === "learning" && !goal.setId && !progress.complete && profile && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="self-start"
                    disabled={!!busy}
                    onClick={() => void change(key, { [PROFILE_KEY]: { ...profile, knownPuzzles: [...new Set([...profile.knownPuzzles, goal.puzzle])] } })}
                  >
                    <Check />I can solve it
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {error && (
          <p className="px-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </Section>
    </div>
  );
}
