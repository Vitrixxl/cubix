/**
 * An algorithm in 3D, over the page: the cube on the left, plays the algorithm under the controls; its name, the
 * algorithm with the move being played lit, its alternatives and how to hold the cube on the right. Phones get it as
 * a sheet, the cube on top. The previous and next algorithms of the list are a click away.
 */
import { store as s } from "./store";
import { Choice, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer, usePlayerKeys } from "./AlgPlayer";
import { PaneHead, Stepper } from "./algorithms";
import { tr } from "../../src/client/i18n";

export function AlgView() {
  const view = s.algView,
    phone = usePhone(),
    item = view?.items[view.index],
    alg = item ? (item.algs[view!.choice] ?? item.algs[0]!) : "";
  const player = useAlgPlayer(alg, item?.size, item?.mask, { setup: item?.setup });
  // Only while the dialog is open: its content can outlive it for the closing animation.
  usePlayerKeys(s.overlay === "algPlayer" ? player : null);
  if (!view || !item) return null;
  const count = view.items.length;
  const stepper = count > 1 && <Stepper action="algView" index={view.index} count={count} tips={[tr("Previous algorithm"), tr("Next algorithm")]} />;
  const choices = item.algs.length > 1 && (
    <Choice
      prefix="algChoice:"
      label={tr("Algorithm")}
      value={String(view.choice)}
      options={item.algs.map((_, i) => ({ id: String(i), label: i ? tr("Alternative {0}", { 0: i }) : "Main" }))}
      className="flex-wrap"
    />
  );
  const text = (
    <div className="flex flex-col gap-3">
      <PlayerAlg key={alg} player={player} text={alg} size={phone ? 20 : 24} />
      {item.note && <p className="text-sm leading-relaxed text-muted-foreground">{item.note}</p>}
    </div>
  );
  if (phone)
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <PaneHead title={item.name} sub={item.detail ?? item.context}>
          {stepper}
        </PaneHead>
        {player && <PlayerCube key={alg} player={player} size={260} className="self-center" />}
        {player && <ViewButtons player={player} className="self-center" />}
        {player && <PlayerControls player={player} touch />}
        {choices}
        {text}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="relative flex w-105 shrink-0 items-center justify-center bg-muted/30">
        {player && <PlayerCube key={alg} player={player} size={360} />}
        {player && <ViewButtons player={player} className="absolute bottom-6 left-1/2 -translate-x-1/2" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-6 pt-5">
        {/* Clear of the dialog's close button. */}
        <PaneHead title={item.name} sub={item.detail ?? item.context} className="pr-8">
          {stepper}
        </PaneHead>
        {choices}
        {/* Room for the lit move's background and focus ring, which the scrolling would clip. */}
        <div className="-m-1.5 min-h-0 flex-1 overflow-y-auto p-1.5">{text}</div>
        {player && <PlayerControls player={player} />}
      </div>
    </div>
  );
}
