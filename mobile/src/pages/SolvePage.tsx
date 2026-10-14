import { useAtomValue, useSetAtom } from "jotai";
import { ChevronRight, MessageSquare, Share2, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { fmtSolve } from "../../../src/client/lib/format";
import { heldAlg } from "../../../src/client/lib/solution";
import { COLOUR_NAMES, type Phase, type PhaseId, type SolveAnalysis } from "../../../src/client/lib/solveAnalysis";
import type { Penalty } from "../../../src/shared/types";
import { said, tr } from "../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { API_ORIGIN, api, local } from "../api";
import { PlayerControls, PlayerCube, useAlgPlayer } from "../components/AlgPlayer";
import { PushedBar } from "../components/AppBar";
import { CaseDiagram } from "../components/CaseDiagram";
import { Alg, Empty, Label, Numeric, Segmented } from "../components/layout";
import { useSolveMenu } from "../components/SolveMenus";
import { SolveDetail } from "../components/SolveDetail";
import { analyseSolution, Dot, seconds, SolveBar, StepNames, useStepColour } from "../components/analysis/steps";
import { deletedSolveIdAtom, goBackAtom, replaceRouteAtom, routeAtom, signedInAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { useColors } from "../theme";
import { useLayout } from "../hooks/useLayout";

/**
 * A solve on its own screen, pushed from a list of times: its time and penalty, the scramble, the solution replayed in
 * 3D, and for a smart cube solve the bar of its steps; a step opens its analysis (`step`) on a screen of its own, as
 * the web's SolveView.tsx and SolveAnalysis.tsx.
 *
 * @public Loaded on demand, by `require` (App.tsx, CoachingPage.tsx).
 */
export function SolvePage({ id, step, comment }: { id: number; step?: string; comment?: boolean }) {
  const version = useAtomValue(statsVersionAtom), updated = useAtomValue(updatedSolveAtom), deleted = useAtomValue(deletedSolveIdAtom);
  const stored = useMemo(() => local.read.solve(id), [id, version, updated]);
  const { optimistic } = useSolveMenu(), goBack = useSetAtom(goBackAtom);
  useEffect(() => { if (deleted === id) goBack(); }, [deleted, id, goBack]);
  if (!stored) return <View className="flex-1">
    <PushedBar title={tr("Solve")} />
    <Empty title={tr("This solve was deleted.")} />
  </View>;
  const solve = { ...stored, ...optimistic.get(id) };
  return step ? <StepScreen solve={solve} step={step as PhaseId} /> : <Replay solve={solve} comment={comment} />;
}

type Shown = NonNullable<ReturnType<typeof local.read.solve>>;

/** The solve: its actions in the bar and beside the time, the rest drawn by SolveDetail. */
function Replay({ solve, comment }: { solve: Shown; comment?: boolean }) {
  const { togglePenalty, deleteTime, busy } = useSolveMenu();
  const signedIn = useAtomValue(signedInAtom), setRoute = useSetAtom(routeAtom);
  const notify = useSetAtom(updatedSolveAtom), bump = useSetAtom(statsVersionAtom);
  const [commenting, setCommenting] = useState(!!comment), [draft, setDraft] = useState(solve.comment ?? "");
  const saved = (next: Shown) => { notify(next); bump(v => v + 1); };
  const { tablet } = useLayout();
  const saveComment = () => {
    setCommenting(false);
    if (draft.trim() === (solve.comment ?? "")) return;
    void api.setComment(solve.id, draft.trim() || null).then(saved, () => {});
  };
  const share = async () => {
    const url = API_ORIGIN + "/solve/" + await api.shareSolve(solve.id);
    await Share.share({ message: url, title: fmtSolve(solve.time_ms, solve.penalty) });
  };
  return <View className="flex-1">
    <PushedBar title={tr("Solve")}>
      {signedIn && <Pressable accessibilityRole="button" accessibilityLabel={tr("Share a link to this solve")} onPress={() => void share().catch(() => {})}
        className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={Share2} size={20} /></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Delete solve")} disabled={busy} onPress={() => void deleteTime(solve.id)}
        className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={Trash2} size={20} /></Pressable>
    </PushedBar>
    <View className={cn("min-h-0 flex-1 px-4 pb-3", tablet && "px-7")}>
      <SolveDetail key={solve.id} solve={solve} fill
        onSave={async solution => { try { saved(await api.setSolution(solve.id, solution)); return true; } catch { return false; } }}
        onStep={phase => setRoute({ page: "solve", id: solve.id, step: phase })}
        aside={<Segmented<Penalty> label={tr("Penalty")} className="w-40" value={solve.penalty} onChange={p => void togglePenalty(solve, p)}
          options={[{ id: "none", label: tr("OK") }, { id: "+2", label: "+2" }, { id: "dnf", label: tr("DNF") }]} />}
        action={<Button variant="ghost" size="sm" className="h-10 gap-1.5" onPress={() => { setDraft(solve.comment ?? ""); setCommenting(true); }}>
          <Icon as={MessageSquare} size={16} className={solve.comment ? "text-primary" : undefined} /><Text>{tr("Comment")}</Text>
        </Button>}
        comment={commenting ? <Input accessibilityLabel={tr("Solve comment")} placeholder={tr("What happened on this solve?")} value={draft} onChangeText={setDraft}
          autoFocus maxLength={500} submitBehavior="blurAndSubmit" onBlur={saveComment} returnKeyType="done" /> : undefined} />
    </View>
  </View>;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const colourLabel = (colour: string) => ({ yellow: tr("yellow"), white: tr("white"), green: tr("green"), blue: tr("blue"), orange: tr("orange"), red: tr("red") })[colour] ?? colour;
const tps = (part: { turns: string[]; execution: number }) => (part.execution > 0 ? (part.turns.length / (part.execution / 1000)).toFixed(1) : "–");

/** A figure on a quiet well: its caption (with its dot), then the value. */
function Well({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return <View className="min-w-0 flex-1 gap-0.5 rounded-xl bg-muted px-2.5 py-1.5">
    <View className="flex-row items-center gap-1">{dot && <Dot colour={dot} size={6} />}<Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{label}</Text></View>
    <Numeric numberOfLines={1} adjustsFontSizeToFit className="text-base font-bold">{value}</Numeric>
  </View>;
}

/** One step of a smart cube solve: the solve's figures and steps on top, then the step replayed, its case and algorithms. */
function StepScreen({ solve, step }: { solve: Shown; step: PhaseId }) {
  const analysis = useMemo(() => analyseSolution(solve.scramble, solve.solution), [solve.scramble, solve.solution]);
  const replace = useSetAtom(replaceRouteAtom), colors = useColors(), { tablet, wide } = useLayout();
  const phase = analysis?.phases.find(p => p.id === step);
  const detail = phase && <PhaseDetail phase={phase} />;
  return <View className="flex-1">
    <PushedBar title={tr("Solve analysis")} />
    {!analysis || !phase ? <Empty title={tr("No turns recorded for this solve.")} /> : <View className={cn("min-h-0 flex-1 flex-row gap-4 px-4 pb-3", tablet && "px-7")}>
    {/* On a wide screen the step's case and algorithms are docked at the right, beside the step replayed. */}
    <View className="min-h-0 min-w-0 flex-1 gap-2.5">
      <View className="flex-row gap-1.5">
        <Well label={tr("Time")} value={`${seconds(analysis.time)} s`} dot={colors.primary} />
        <Well label={tr("Turns")} value={String(analysis.turns)} />
        <Well label={tr("TPS")} value={analysis.tps.toFixed(2)} dot={colors.variables["--lilac"]} />
        <Well label={tr("Cross")} value={capitalised(colourLabel(COLOUR_NAMES[analysis.cross]))} />
      </View>
      <View>
        <SolveBar analysis={analysis} selected={step} onSelect={id => replace({ page: "solve", id: solve.id, step: id })} height={16} />
        <StepNames analysis={analysis} selected={step} onSelect={id => replace({ page: "solve", id: solve.id, step: id })} />
      </View>
      <PhaseCard key={phase.id} analysis={analysis} phase={phase} scramble={solve.scramble!} cubeSize={tablet ? 180 : 104} />
      {!wide && <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 pb-2">{detail}</ScrollView>}
    </View>
    {wide && <ScrollView className="w-[400px] grow-0 rounded-[26px] bg-popover" contentContainerClassName="gap-3 p-4">{detail}</ScrollView>}
    </View>}
  </View>;
}

/** The step: its name and time, the step replayed on its own cube, and its figures. */
function PhaseCard({ analysis, phase, scramble, cubeSize }: { analysis: SolveAnalysis; phase: Phase; scramble: string; cubeSize: number }) {
  const colour = useStepColour(), colors = useColors();
  // The step's turns, played on the cube as it stood before it: the scramble, then the turns before the step.
  const { setup, alg } = useMemo(() => {
    const moves = analysis.recording.moves.map(m => m.move),
      held = heldAlg(scramble.trim().split(/\s+/)), done = heldAlg(moves.slice(0, phase.from));
    return { setup: held === null || done === null ? undefined : `${held} ${done}`.trim(), alg: heldAlg(moves.slice(phase.from, phase.to)) ?? "" };
  }, [analysis, phase, scramble]);
  const player = useAlgPlayer(alg, setup === undefined ? null : 3, "full", { setup, autoplay: phase.skip ? undefined : 300 });
  return <View className="gap-2.5 rounded-3xl bg-card p-3.5">
    <View className="flex-row items-center gap-2.5">
      <Dot colour={colour(phase.id)} size={14} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-2xl font-extrabold tracking-[-0.03em]">{said(phase.label)}</Text>
        {phase.pair && <Text numberOfLines={1} className="text-sm text-muted-foreground">{capitalised(tr("{0}–{1} pair", { 0: colourLabel(COLOUR_NAMES[phase.pair[0]]), 1: colourLabel(COLOUR_NAMES[phase.pair[1]]) }))}</Text>}
      </View>
      <Numeric className="text-3xl font-extrabold tracking-[-0.04em]">{phase.skip ? tr("Skip") : `${seconds(phase.end - phase.start)} s`}</Numeric>
    </View>
    {phase.skip ? <Text className="text-sm text-muted-foreground">{tr("Already solved by the step before: nothing to do.")}</Text> : <>
      <View className="flex-row items-center gap-3">
        {player && <PlayerCube player={player} size={cubeSize} />}
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row gap-1.5">
            <Well label={tr("Recog.")} value={`${seconds(phase.recognition)} s`} dot={colors.variables["--warning"]} />
            <Well label={tr("Exec.")} value={`${seconds(phase.execution)} s`} dot={colors.primary} />
          </View>
          <View className="flex-row gap-1.5">
            <Well label={tr("Turns")} value={String(phase.turns.length)} />
            <Well label={tr("TPS")} value={tps(phase)} dot={colors.variables["--lilac"]} />
          </View>
        </View>
      </View>
      {player && <PlayerControls player={player} inline />}
    </>}
  </View>;
}

/** The step's case, the turns made, its looks when done in two, and the catalogue's algorithms beside the turns made. */
function PhaseDetail({ phase }: { phase: Phase }) {
  const setRoute = useSetAtom(routeAtom);
  const open = (id: string) => setRoute({ page: "algorithms", caseId: id });
  if (phase.skip) return null;
  return <>
    {/^(f2l|oll|pll)/.test(phase.id) && <CaseRow label={phase.looks ? tr("Case in one look") : tr("Case")} known={phase.case} onOpen={open} />}
    <View className="gap-1">
      <Label className="font-bold tracking-widest uppercase">{tr("Your turns")}</Label>
      <Alg text={phase.turns.join(" ")} size={16} />
    </View>
    {phase.looks && <View className="gap-2">
      <Label className="font-bold tracking-widest uppercase">{phase.looks.length === 2 ? tr("Two looks") : tr("In {0} parts", { 0: phase.looks.length })}</Label>
      {phase.looks.map(look => <View key={look.label} className="gap-1.5 rounded-2xl bg-card p-3">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="text-base font-bold">{said(look.label)}</Text>
          <Numeric className="text-base font-bold">{seconds(look.end - look.start)} s</Numeric>
        </View>
        <Numeric className="text-xs text-muted-foreground">{tr("Recognition")} {seconds(look.recognition)} {tr("s · Execution")} {seconds(look.execution)} s · {look.turns.length} {tr("turns")}</Numeric>
        <Alg text={look.turns.join(" ")} size={15} />
        {look.case && <CaseRow known={look.case} onOpen={open} small />}
        {look.suggestions[0] && <View className="flex-row items-baseline gap-2"><Text className="text-xs text-muted-foreground">{tr("Catalogue")}</Text><Alg text={look.suggestions[0].alg} size={14} /></View>}
      </View>)}
    </View>}
    {phase.suggestions.length > 0 && <View className="gap-1">
      <Label className="font-bold tracking-widest uppercase">{phase.id === "cross" ? tr("Optimal cross") : phase.looks ? tr("In one look · {0}", { 0: phase.case?.name }) : tr("Algorithms for this case")}</Label>
      {phase.suggestions.map(s => {
        const fewer = phase.turns.length - s.turns;
        return <Pressable key={s.alg} disabled={!phase.case} onPress={() => phase.case && open(phase.case.id)} className="min-h-10 flex-row items-center gap-3 active:opacity-70">
          <Alg text={s.alg} size={15} className="flex-1" />
          <Numeric className={cn("text-xs", fewer > 0 ? "font-bold text-success" : "text-muted-foreground")}>{s.turns} {tr("turns")}{fewer > 0 ? tr(" · {0} fewer", { 0: fewer }) : ""}</Numeric>
        </Pressable>;
      })}
    </View>}
  </>;
}

/** A case of the catalogue, which opens its algorithms. */
function CaseRow({ label, known, onOpen, small = false }: { label?: string; known?: { id: string; name: string }; onOpen: (id: string) => void; small?: boolean }) {
  const c = known && local.read.catalog("333").cases.find(x => x.id === known.id);
  if (!known) return <View className="gap-0.5">{label && <Label className="font-bold tracking-widest uppercase">{label}</Label>}<Text className="text-base">{tr("Not in the catalogue")}</Text></View>;
  return <Pressable onPress={() => onOpen(known.id)} accessibilityRole="button" accessibilityLabel={`${said(known.name)}: ${tr("Open the algorithms")}`} className="flex-row items-center gap-3 rounded-xl active:bg-muted/60">
    {c && <CaseDiagram c={c} size={small ? 40 : 52} />}
    <View className="min-w-0 flex-1 gap-0.5">
      {label && <Label className="font-bold tracking-widest uppercase">{label}</Label>}
      <Text className="text-base font-bold">{said(known.name)}</Text>
    </View>
    <Text className="text-sm font-bold text-primary">{tr("Algorithms")}</Text>
    <Icon as={ChevronRight} size={15} className="text-primary" />
  </Pressable>;
}
