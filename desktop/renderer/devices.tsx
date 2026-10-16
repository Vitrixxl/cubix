/**
 * The devices that drive the timer: a Bluetooth smart cube, a Bluetooth smart timer and a Stackmat on the audio input,
 * each with its state and battery, connected or let go from one dialog (the account menu's Devices, or the button
 * beside the scramble). A cube whose MAC address the browser cannot read asks for it here.
 */
import { useState, useSyncExternalStore } from "react";
import { Bluetooth, BluetoothConnected, BluetoothSearching, Box, Timer, type LucideIcon } from "lucide-react";
import { smartCube } from "../../src/client/lib/smartCube";
import { smartTimer } from "../../src/client/lib/bluetooth/timers";
import { parseMac, WRONG_MAC } from "../../src/client/lib/bluetooth/link";
import { stackmat } from "../../src/client/lib/stackmat";
import { tr } from "../../src/client/i18n";
import { Input } from "@/components/ui/input";
import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Button, LABEL, Modal } from "./ui";

type Link = "off" | "connecting" | "on";
const useCube = () => useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot, () => smartCube.snapshot);
const useTimerDevice = () => useSyncExternalStore(smartTimer.subscribe, () => smartTimer.snapshot, () => smartTimer.snapshot);
const useStackmat = () => useSyncExternalStore(stackmat.subscribe, () => stackmat.snapshot, () => stackmat.snapshot);

/** The button beside the scramble: lit while a device is connected, pulsing while one connects. */
export function DevicesButton() {
  const links: Link[] = [useCube().status, useTimerDevice().link, useStackmat().link],
    on = links.includes("on"),
    connecting = links.includes("connecting");
  return (
    <Button
      action="devices"
      icon={on ? BluetoothConnected : connecting ? BluetoothSearching : Bluetooth}
      tip={tr("Devices")}
      className={cn(on && "text-primary", connecting && "animate-pulse text-primary")}
    />
  );
}

function Row({ icon: I, label, link, detail, action, extra }: { icon: LucideIcon; label: string; link: Link; detail?: string; action: string; extra?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3" data-device={action} data-status={link}>
      <I className={cn("size-5 shrink-0 text-muted-foreground", link === "on" && "text-success", link === "connecting" && "animate-pulse text-primary")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        {detail && <div className={cn(LABEL, "line-clamp-2")}>{detail}</div>}
      </div>
      {extra}
      <Button action={action} variant={link === "off" ? "default" : "outline"} size="sm">
        {link === "off" ? tr("Connect") : link === "connecting" ? tr("Cancel") : tr("Disconnect")}
      </Button>
    </div>
  );
}

/** The question of a cube's MAC address, its field filled with the likely one. */
function MacQuestion({ request }: { request: NonNullable<ReturnType<typeof useCube>["macRequest"]> }) {
  const [text, setText] = useState(request.guess ?? ""),
    valid = !!parseMac(text);
  return (
    <form
      className="flex flex-col gap-2 rounded-xl bg-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) smartCube.answerMac(text);
      }}
    >
      <label className={LABEL} htmlFor="cube-mac">
        {tr("MAC address")} · {request.name}
      </label>
      <div className="flex gap-2">
        <Input id="cube-mac" autoFocus value={text} placeholder="AA:BB:CC:DD:EE:FF" spellCheck={false} aria-invalid={request.wrong || undefined} onChange={(e) => setText(e.target.value)} className="font-mono" />
        <UiButton type="submit" disabled={!valid}>
          {tr("OK")}
        </UiButton>
      </div>
      {request.wrong && <p className="text-xs font-medium text-destructive">{tr(WRONG_MAC)}</p>}
    </form>
  );
}

const level = (battery?: number) => (battery === undefined ? "" : ` · ${battery}%`);

export function DevicesDialog() {
  const cube = useCube(),
    timer = useTimerDevice(),
    mat = useStackmat(),
    dev = typeof CUBIX_DEV !== "undefined" && CUBIX_DEV;
  return (
    <Modal id="devices" title={tr("Devices")} className="sm:max-w-md">
      <div className="flex flex-col gap-2">
        <Row
          icon={Box}
          label={tr("Cube")}
          link={cube.status}
          action="smartCube"
          detail={cube.status === "on" ? cube.name + level(cube.battery) : cube.status === "connecting" ? tr("Connecting…") : cube.error && tr(cube.error)}
          extra={dev && cube.status === "off" && <Button action="smartCube:virtual" variant="ghost" size="sm">Virtual</Button>}
        />
        {cube.macRequest && <MacQuestion key={cube.macRequest.name + cube.macRequest.wrong} request={cube.macRequest} />}
        <Row
          icon={Timer}
          label={tr("Timer")}
          link={timer.link}
          action="smartTimer"
          detail={timer.link === "on" ? timer.name : timer.link === "connecting" ? tr("Connecting…") : timer.error && tr(timer.error)}
        />
        <Row icon={Timer} label="Stackmat" link={mat.link} action="stackmat" detail={mat.link === "off" ? tr("Experimental") : mat.link === "connecting" ? tr("Waiting for the Stackmat…") : tr("Stackmat connected")} />
      </div>
    </Modal>
  );
}
