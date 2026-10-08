/**
 * Bringing the solves of other timers, as the web's ImportTimes.tsx: files chosen in Android's picker are read on the
 * phone (timerImport.ts), summed up per file (the timer, its events, its dates, what is left out), then written at
 * once with their own dates.
 */
import { CircleCheck, FileUp, Upload, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { plural } from "../../../src/client/lib/format";
import { IMPORT_APPS, readTimerExport, type ImportedSolve, type TimerImport } from "../../../src/client/lib/timerImport";
import { EVENTS, eventInfo, type EventId, type PuzzleId } from "../../../src/shared/puzzles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { api } from "../api";
import { pickTextFiles } from "../lib/files";
import { IconTile, Numeric } from "./layout";
import { ChoiceButton } from "./PuzzlePicker";
import { localFormat, tr } from "../../../src/client/i18n";

interface Loaded {
  name: string;
  read?: TimerImport;
  error?: string;
  /** The event picked for a file that does not tell it. */
  event: EventId;
}
const EVENT_ITEMS = EVENTS.map(e => ({ id: e.id, label: e.label }));
const label = (id: EventId) => tr(EVENTS.find(e => e.id === id)?.label ?? id);
const day = localFormat({ day: "numeric", month: "short", year: "numeric" });
/** A file's solves, with the event picked when the file does not tell it. */
const solvesOf = (file: Loaded): ImportedSolve[] => file.read ? file.read.needsEvent ? file.read.solves.map(solve => ({ ...solve, event: file.event })) : file.read.solves : [];

export function ImportTimes({ onImported }: { onImported?: (puzzles: PuzzleId[]) => void }) {
  const [files, setFiles] = useState<Loaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ imported: number; duplicates: number } | null>(null);
  const [error, setError] = useState("");
  const choose = async () => {
    setDone(null); setError("");
    try {
      const picked = await pickTextFiles();
      const loaded = await Promise.all(picked.map(async (file): Promise<Loaded> => {
        try { return { name: file.name, read: readTimerExport(await file.text()), event: "333" }; }
        catch (e) { return { name: file.name, error: (e as Error).message, event: "333" }; }
      }));
      setFiles(current => [...current, ...loaded]);
    } catch (e) { setError((e as Error).message); }
  };
  const solves = files.flatMap(solvesOf);
  const save = async () => {
    setBusy(true); setError("");
    try {
      setDone(await api.importSolves(solves));
      setFiles([]);
      onImported?.([...new Set(solves.map(solve => eventInfo(solve.event)!.puzzle))]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <View className="gap-3">
    <View className="items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-6">
      <IconTile icon={Upload} />
      <Text className="text-center text-xs text-muted-foreground">{IMPORT_APPS.join(" · ")}</Text>
      <Button variant="outline" className="h-11" disabled={busy} onPress={() => void choose()}>
        <Icon as={FileUp} size={16} /><Text>{tr("Choose files")}</Text>
      </Button>
    </View>
    {files.length > 0 && <View className="gap-2" accessibilityLabel={tr("Files to import")}>
      {files.map((file, i) => <FileRow key={i} file={file}
        onEvent={event => setFiles(current => current.map((f, j) => j === i ? { ...f, event } : f))}
        onRemove={() => setFiles(current => current.filter((_, j) => j !== i))} />)}
    </View>}
    {solves.length > 0 && <Button className="h-11 self-start" disabled={busy} onPress={() => void save()}>
      <Text>{busy ? tr("Importing…") : tr("Import {0}", { 0: plural(solves.length, "solve") })}</Text>
    </Button>}
    {done && <Alert variant={done.imported ? "info" : "default"} icon={CircleCheck} title={done.imported ? tr("{0} imported", { 0: plural(done.imported, "solve") }) : tr("Nothing new")}>
      {done.duplicates ? tr("{0} already here", { 0: plural(done.duplicates, "solve") }) : undefined}
    </Alert>}
    {error ? <Alert variant="destructive" title={error} /> : null}
  </View>;
}

/** One file: the timer it comes from, its solves per event and dates, what is left out; or why it cannot be read. */
function FileRow({ file, onEvent, onRemove }: { file: Loaded; onEvent: (event: EventId) => void; onRemove: () => void }) {
  const read = file.read, solves = solvesOf(file), events = new Map<EventId, number>();
  for (const solve of solves) events.set(solve.event, (events.get(solve.event) ?? 0) + 1);
  const dates = solves.map(solve => solve.at), skipped = Object.entries(read?.skipped ?? {});
  return <View className="flex-row items-start gap-2 rounded-xl border border-border bg-card py-2 pr-1 pl-3">
    <View className="min-w-0 flex-1 gap-1 py-1">
      <View className="flex-row items-baseline gap-2">
        <Text numberOfLines={1} className="shrink-0 text-sm font-medium">{read ? read.app : file.name}</Text>
        {read ? <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{file.name}</Text> : null}
      </View>
      {file.error ? <Text className="text-xs text-destructive">{file.error}</Text> : <>
        <Numeric className="text-xs text-muted-foreground">
          {[...events].map(([event, n]) => `${label(event)} ${n.toLocaleString()}`).join(" · ") || tr("No solves")}
          {dates.length > 0 ? ` · ${day.format(dates.reduce((a, b) => Math.min(a, b)))} – ${day.format(dates.reduce((a, b) => Math.max(a, b)))}` : ""}
        </Numeric>
        {skipped.length > 0 && <Text className="text-xs text-muted-foreground">{tr("Left out:") + " " + skipped.map(([reason, n]) => `${n.toLocaleString()} (${tr(reason)})`).join(", ")}</Text>}
        {read?.needsEvent && <ChoiceButton label={tr("Event of {0}", { 0: file.name })} value={file.event} options={EVENT_ITEMS} onChange={onEvent} className="self-start" />}
      </>}
    </View>
    <Button variant="ghost" size="icon" className="size-11" accessibilityLabel={tr("Remove {0}", { 0: file.name })} onPress={onRemove}>
      <Icon as={X} size={18} className="text-muted-foreground" />
    </Button>
  </View>;
}
