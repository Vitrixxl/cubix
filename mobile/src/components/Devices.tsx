import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { Box, Timer, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";
import { toastAtom } from "./Toast";
import { bleAdapter } from "../platform/ble";
import { smartCube } from "../../../src/client/lib/smartCube";
import { bluetoothCube } from "../../../src/client/lib/bluetooth/cubes";
import { smartTimer } from "../../../src/client/lib/bluetooth/timers";
import { announceDevice, parseMac, WRONG_MAC } from "../../../src/client/lib/bluetooth/link";
import { stackmat } from "../../../src/client/lib/stackmat";
import { tr } from "../../../src/client/i18n";

/**
 * The devices that drive the timer, as the web's dialog (desktop/renderer/devices.tsx): a Bluetooth smart cube, a
 * Bluetooth smart timer, and on the web a Stackmat on the audio input. A cube whose MAC address the browser cannot
 * read asks for it here (Android always knows it).
 */
export const devicesAtom = atom(false);

type Link = "off" | "connecting" | "on";
const toggleCube = () => (smartCube.snapshot.status !== "off" ? smartCube.disconnect() : void smartCube.connect(bluetoothCube(bleAdapter, smartCube.askMac)));
const toggleTimer = () => (smartTimer.snapshot.link !== "off" ? smartTimer.disconnect() : void smartTimer.connect(bleAdapter));
const toggleStackmat = () => (stackmat.snapshot.link !== "off" ? stackmat.disconnect() : void stackmat.connect());

function Row({ icon, label, link, detail, onPress }: { icon: LucideIcon; label: string; link: Link; detail?: string; onPress: () => void }) {
  return <View className="min-h-14 flex-row items-center gap-3">
    <Icon as={icon} size={20} className={cn("text-muted-foreground", link === "on" && "text-success", link === "connecting" && "text-primary")} />
    <View className="min-w-0 flex-1">
      <Text className="text-base font-semibold">{label}</Text>
      {detail ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{detail}</Text> : null}
    </View>
    <Button size="sm" variant={link === "off" ? "default" : "outline"} onPress={onPress}>
      <Text>{link === "off" ? tr("Connect") : link === "connecting" ? tr("Cancel") : tr("Disconnect")}</Text>
    </Button>
  </View>;
}

function MacQuestion({ name, guess, wrong }: { name: string; guess?: string; wrong: boolean }) {
  const [text, setText] = useState(guess ?? "");
  const valid = !!parseMac(text);
  return <View className="gap-2 rounded-xl bg-muted p-3">
    <Text className="text-sm text-muted-foreground">{tr("MAC address")} · {name}</Text>
    <View className="flex-row gap-2">
      <Input value={text} onChangeText={setText} placeholder="AA:BB:CC:DD:EE:FF" autoCapitalize="characters" autoCorrect={false} aria-invalid={wrong || undefined}
        onSubmitEditing={() => valid && smartCube.answerMac(text)} className="flex-1 font-mono" />
      <Button disabled={!valid} onPress={() => smartCube.answerMac(text)}><Text>{tr("OK")}</Text></Button>
    </View>
    {wrong ? <Text className="text-sm font-medium text-destructive">{tr(WRONG_MAC)}</Text> : null}
  </View>;
}

const level = (battery?: number) => (battery === undefined ? "" : ` · ${battery}%`);

/** One field of a device's state: the sheet, always mounted, draws again when it changes, never on each packet. */
const useField = <S, K extends keyof S>(device: { subscribe: (listener: () => void) => () => void; snapshot: S }, key: K) =>
  useSyncExternalStore(device.subscribe, () => device.snapshot[key]);

export function DevicesSheet() {
  const [open, setOpen] = useAtom(devicesAtom);
  const cube = { status: useField(smartCube, "status"), name: useField(smartCube, "name"), battery: useField(smartCube, "battery"), error: useField(smartCube, "error") },
    timer = { link: useField(smartTimer, "link"), name: useField(smartTimer, "name"), error: useField(smartTimer, "error") },
    mat = { link: useField(stackmat, "link") };
  const request = useField(smartCube, "macRequest");
  return <Sheet open={open} onClose={() => setOpen(false)} title={tr("Devices")}>
    <View className="gap-2">
      <Row icon={Box} label={tr("Cube")} link={cube.status} onPress={toggleCube}
        detail={cube.status === "on" ? cube.name + level(cube.battery) : cube.status === "connecting" ? tr("Connecting…") : cube.error && tr(cube.error)} />
      {request ? <MacQuestion key={request.name + request.wrong} {...request} /> : null}
      <Row icon={Timer} label={tr("Timer")} link={timer.link} onPress={toggleTimer}
        detail={timer.link === "on" ? timer.name : timer.link === "connecting" ? tr("Connecting…") : timer.error && tr(timer.error)} />
      {/* The audio of a Stackmat is read in the browser only. */}
      {Platform.OS === "web" ? <Row icon={Timer} label="Stackmat" link={mat.link} onPress={toggleStackmat}
        detail={mat.link === "off" ? tr("Experimental") : mat.link === "connecting" ? tr("Waiting for the Stackmat…") : tr("Stackmat connected")} /> : null}
    </View>
  </Sheet>;
}

/** Tells the devices coming and going as toasts, wherever the player is (once in the app). */
export function DeviceNotices() {
  const toast = useSetAtom(toastAtom), open = useRef(false);
  open.current = useAtomValue(devicesAtom);
  useEffect(() => {
    // An error the open sheet shows already is not told again.
    const notify = ({ title, description, tone }: { title: string; description?: string; tone: string }) => tone === "error" && open.current || toast({ title, description, error: tone === "error" });
    const stops: (() => void)[] = [];
    announceDevice(() => ({ ...smartCube.snapshot, link: smartCube.snapshot.status }), (l) => stops.push(smartCube.subscribe(l)), notify);
    announceDevice(() => smartTimer.snapshot, (l) => stops.push(smartTimer.subscribe(l)), notify);
    return () => stops.forEach((stop) => stop());
  }, [toast]);
  return null;
}
