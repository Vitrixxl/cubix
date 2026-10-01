/**
 * An algorithm in 3D, over the page: the cube on the left, plays the algorithm under the controls; its name, the
 * algorithm with the move being played lit, its alternatives and how to hold the cube on the right. Phones get it as
 * a sheet, the cube on top. The previous and next algorithms of the list are a click away.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { store as s, run } from "./store";
import { Choice, NUMERIC, Tip, usePhone } from "./ui";
import { PlayerAlg, PlayerControls, PlayerCube, playerKeys, useAlgPlayer } from "./AlgPlayer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AlgView() {
  const view = s.algView,
    phone = usePhone(),
    item = view?.items[view.index],
    alg = item ? (item.algs[view!.choice] ?? item.algs[0]!) : "";
  const player = useAlgPlayer(alg, item?.size, item?.mask, { autoplay: 600, setup: item?.setup });
  if (!view || !item) return null;
  const count = view.items.length;
  const stepper = count > 1 && (
    <div className="flex shrink-0 items-center gap-1">
      <Tip content="Previous algorithm">
        <Button variant="ghost" size={phone ? "icon-lg" : "icon-sm"} aria-label="Previous algorithm" data-action="algView:previous" disabled={view.index === 0} onClick={run("algView:previous")} className={cn(phone && "size-11")}>
          <ChevronLeft />
        </Button>
      </Tip>
      <span className={cn(NUMERIC, "min-w-12 text-center text-xs text-muted-foreground")}>
        {view.index + 1} / {count}
      </span>
      <Tip content="Next algorithm">
        <Button variant="ghost" size={phone ? "icon-lg" : "icon-sm"} aria-label="Next algorithm" data-action="algView:next" disabled={view.index === count - 1} onClick={run("algView:next")} className={cn(phone && "size-11")}>
          <ChevronRight />
        </Button>
      </Tip>
    </div>
  );
  const choices = item.algs.length > 1 && (
    <Choice
      prefix="algChoice:"
      label="Algorithm"
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
      <div className="flex min-h-0 flex-1 flex-col gap-4" onKeyDown={playerKeys(player)}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-0 truncate font-sans text-lg font-semibold tracking-tight">{item.name}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{item.detail ?? item.context}</span>
          </div>
          {stepper}
        </div>
        {player && <PlayerCube key={alg} player={player} size={260} className="self-center" />}
        {player && <PlayerControls player={player} touch />}
        {choices}
        {text}
      </div>
    );
  return (
    <div className="flex h-full min-h-0" onKeyDown={playerKeys(player)}>
      <div className="flex w-[420px] shrink-0 items-center justify-center bg-muted/30">{player && <PlayerCube key={alg} player={player} size={360} />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 p-6 pt-5">
        <header className="flex items-center gap-4 pr-8">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h2 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{item.name}</h2>
            <p className="min-w-0 truncate text-sm text-muted-foreground">{item.detail ?? item.context}</p>
          </div>
          {stepper}
        </header>
        {choices}
        <div className="min-h-0 flex-1 overflow-y-auto">{text}</div>
        {player && <PlayerControls player={player} />}
      </div>
    </div>
  );
}
