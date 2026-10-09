/**
 * An algorithm in 3D, over the page: the cube on the left, the algorithm with the move being played lit and the
 * controls under it; its name, the list of its algorithms (each can be the one learned) and its note on the right.
 * Phones get it as a sheet, the cube on top. The previous and next algorithms of the list are a click away.
 */
import { store as s } from "./store";
import { Alg, LABEL, LearnedMark, ROW, run, usePhone } from "./ui";
import { cn } from "@/lib/utils";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer, usePlayerKeys } from "./AlgPlayer";
import { PaneHead, Stepper } from "./algorithms";
import { tr } from "../../src/client/i18n";

export function AlgView() {
  const view = s.algView,
    phone = usePhone(),
    item = view?.items[view.index],
    alg = item ? (item.algs[view!.choice] ?? item.algs[0]!) : "";
  const player = useAlgPlayer(alg, item?.size, item?.mask, { setup: item?.setup, puzzle: item?.puzzle });
  // Only while the dialog is open: its content can outlive it for the closing animation.
  usePlayerKeys(s.overlay === "algPlayer" ? player : null);
  if (!view || !item) return null;
  const count = view.items.length;
  const stepper = count > 1 && <Stepper action="algView" index={view.index} count={count} tips={[tr("Previous algorithm"), tr("Next algorithm")]} />;
  // A case of the catalog: each of its algorithms can be the one it was learned with.
  const c = s.find(item.key),
    chosen = c && s.learned.has(c.id) ? (s.learnedAlgs[c.id] ?? []) : [];
  const list = (
    <div className="flex flex-col gap-1">
      {item.algs.map((a, i) => (
        <div key={i} className="group/row flex min-w-0 items-center gap-1">
          <button type="button" data-action={"algChoice:" + i} onClick={run("algChoice:" + i)} aria-pressed={i === view.choice} className={cn(ROW, "flex min-w-0 flex-1 flex-col gap-1 px-3 py-2")}>
            <span className={LABEL}>{i ? tr("Alternative {0}", { 0: i }) : tr("Main")}</span>
            <Alg text={a} size={16} />
          </button>
          {c?.algorithms[i] && <LearnedMark id={c.id} learned={chosen.includes(c.algorithms[i].alg)} action={`learnAlg:${c.id}:${i}`} touch={phone} />}
        </div>
      ))}
    </div>
  );
  const note = item.note && <p className="text-sm leading-relaxed text-muted-foreground">{item.note}</p>;
  if (phone)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <PaneHead title={item.name} sub={item.detail ?? item.context}>
          {stepper}
        </PaneHead>
        {player && <PlayerCube key={alg} player={player} size={260} className="self-center" />}
        {player && <ViewButtons player={player} className="self-center" />}
        <PlayerAlg key={alg} player={player} text={alg} size={20} />
        {player && <PlayerControls player={player} touch />}
        {list}
        {note}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex w-105 shrink-0 flex-col gap-4 bg-muted/30 p-5">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          {player && <PlayerCube key={alg} player={player} size={280} />}
          {player && <ViewButtons player={player} />}
        </div>
        <PlayerAlg key={alg} player={player} text={alg} size={20} />
        {player && <PlayerControls player={player} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-6 pt-5">
        {/* Clear of the dialog's close button. */}
        <PaneHead title={item.name} sub={item.detail ?? item.context} className="pr-8">
          {stepper}
        </PaneHead>
        {/* Room for the rows' focus ring, which the scrolling would clip. */}
        <div className="-m-1.5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1.5">
          {list}
          {note}
        </div>
      </div>
    </div>
  );
}
