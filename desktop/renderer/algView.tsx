/**
 * An algorithm in 3D, over the page: the cube on the left, plays the algorithm under the controls; its name, the
 * algorithm with the move being played lit, its alternatives and how to hold the cube on the right. Phones get it as
 * a sheet, the cube on top. The previous and next algorithms of the list are a click away.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { store as s, run } from "./store";
import { Choice, NUMERIC, Tip, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer, usePlayerKeys } from "./AlgPlayer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

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
  const stepper = count > 1 && (
    <div className="flex shrink-0 items-center gap-1">
      <Tip content="Previous algorithm">
        <Button variant="ghost" size={phone ? "icon-lg" : "icon-sm"} aria-label={tr("Previous algorithm")} data-action="algView:previous" disabled={view.index === 0} onClick={run("algView:previous")} className={cn(phone && "size-11")}>
          <ChevronLeft />
        </Button>
      </Tip>
      <span className={cn(NUMERIC, "min-w-12 text-center text-xs text-muted-foreground")}>
        {view.index + 1} / {count}
      </span>
      <Tip content="Next algorithm">
        <Button variant="ghost" size={phone ? "icon-lg" : "icon-sm"} aria-label={tr("Next algorithm")} data-action="algView:next" disabled={view.index === count - 1} onClick={run("algView:next")} className={cn(phone && "size-11")}>
          <ChevronRight />
        </Button>
      </Tip>
    </div>
  );
  const choices = item.algs.length > 1 && (
    <Choice
      prefix="algChoice:"
      label={tr("Algorithm")}
      value={String(view.choice)}
      options={item.algs.map((_, i) => ({ id: String(i), label: i ? `Alternative ${i}` : "Main" }))}
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
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-0 truncate font-sans text-lg font-semibold tracking-tight">{said(item.name)}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail ?? item.context}</span>
          </div>
          {stepper}
        </div>
        {player && <PlayerCube key={alg} player={player} size={260} className="self-center" />}
        {player && <ViewButtons player={player} className="self-center" />}
        {player && <PlayerControls player={player} touch />}
        {choices}
        {text}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="relative flex w-[420px] shrink-0 items-center justify-center bg-muted/30">
        {player && <PlayerCube key={alg} player={player} size={360} />}
        {player && <ViewButtons player={player} className="absolute bottom-6 left-1/2 -translate-x-1/2" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-6 pt-5">
        <header className="flex items-center gap-4 pr-8">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{said(item.name)}</h2>
            <p className="min-w-0 truncate text-sm text-muted-foreground">{item.detail ?? item.context}</p>
          </div>
          {stepper}
        </header>
        {choices}
        {/* Room for the lit move's background and focus ring, which the scrolling would clip. */}
        <div className="-m-1.5 min-h-0 flex-1 overflow-y-auto p-1.5">{text}</div>
        {player && <PlayerControls player={player} />}
      </div>
    </div>
  );
}
