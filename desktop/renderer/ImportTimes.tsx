/**
 * Bringing the solves of other timers: files dropped or chosen are read on the device (timerImport.ts), summed up per
 * file (the timer, its events, its dates, what is left out), then written at once with their own dates.
 */
import { useRef, useState } from "react";
import { CircleAlert, CircleCheck, FileUp, Upload, X } from "lucide-react";
import { IMPORT_APPS, readTimerExport, type ImportedSolve, type TimerImport } from "../../src/client/lib/timerImport";
import { EVENTS, eventInfo, type EventId, type PuzzleId } from "../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { call } from "./bridge";
import { store as s } from "./store";
import { IconTile, NUMERIC, Tip, plural } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

interface Loaded {
  name: string;
  read?: TimerImport;
  error?: string;
  /** The event picked for a file that does not tell it. */
  event: EventId;
}
const EVENT_ITEMS = EVENTS.map((e) => ({ value: e.id, label: e.label }));
const label = (id: EventId) => EVENTS.find((e) => e.id === id)?.label ?? id;
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
/** A file's solves, with the event picked when the file does not tell it. */
const solvesOf = (file: Loaded): ImportedSolve[] => (file.read ? (file.read.needsEvent ? file.read.solves.map((solve) => ({ ...solve, event: file.event })) : file.read.solves) : []);

export function ImportTimes({ onImported }: { onImported?: (puzzles: PuzzleId[]) => void }) {
  const [files, setFiles] = useState<Loaded[]>([]),
    [over, setOver] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<{ imported: number; duplicates: number } | null>(null),
    [error, setError] = useState(""),
    input = useRef<HTMLInputElement>(null);
  const load = async (list: FileList | null) => {
    if (!list?.length) return;
    setDone(null);
    setError("");
    const loaded = await Promise.all(
      [...list].map(async (file): Promise<Loaded> => {
        try {
          return { name: file.name, read: readTimerExport(await file.text()), event: "333" };
        } catch (e) {
          return { name: file.name, error: (e as Error).message, event: "333" };
        }
      }),
    );
    setFiles((current) => [...current, ...loaded]);
  };
  const solves = files.flatMap(solvesOf);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = (await call("importSolves", solves)) as { imported: number; duplicates: number };
      setDone(result);
      setFiles([]);
      onImported?.([...new Set(solves.map((solve) => eventInfo(solve.event)!.puzzle))]);
      await s.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void load(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-8 text-center transition-colors", over && "border-primary bg-primary/10")}
      >
        <IconTile icon={Upload} />
        <span className="text-sm font-medium">{tr("Drop your exports here")}</span>
        <span className="max-w-lg text-xs text-muted-foreground">{IMPORT_APPS.join(" · ")}</span>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          <FileUp data-icon="inline-start" />
          {tr("Choose files")}</Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".txt,.json,.csv,.stif"
          onChange={(e) => {
            void load(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-label={tr("Files to import")}>
          {files.map((file, i) => (
            <FileRow
              key={i}
              file={file}
              onEvent={(event) => setFiles((current) => current.map((f, j) => (j === i ? { ...f, event } : f)))}
              onRemove={() => setFiles((current) => current.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
      {solves.length > 0 && (
        <Button onClick={() => void save()} disabled={busy} className="self-start">
          {busy ? tr("Importing…") : tr("Import {0}", { 0: plural(solves.length, "solve") })}
        </Button>
      )}
      {done && (
        <Alert role="status" variant={done.imported ? "info" : "default"}>
          <CircleCheck />
          <AlertTitle>{done.imported ? tr("{0} imported", { 0: plural(done.imported, "solve") }) : tr("Nothing new")}</AlertTitle>
          {done.duplicates ? (
            <AlertDescription>
              {plural(done.duplicates, "solve")} {" "}{tr("already here")}
            </AlertDescription>
          ) : null}
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{said(error)}</AlertTitle>
        </Alert>
      )}
    </div>
  );
}

/** One file: the timer it comes from, its solves per event and dates, what is left out; or why it cannot be read. */
function FileRow({ file, onEvent, onRemove }: { file: Loaded; onEvent: (event: EventId) => void; onRemove: () => void }) {
  const read = file.read,
    solves = solvesOf(file),
    events = new Map<EventId, number>();
  for (const solve of solves) events.set(solve.event, (events.get(solve.event) ?? 0) + 1);
  const dates = solves.map((solve) => solve.at),
    skipped = Object.entries(read?.skipped ?? {});
  return (
    <li>
      <Card size="sm" className="flex-row items-start gap-3 px-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{read ? read.app : file.name}</span>
            {read && <span className="truncate text-xs text-muted-foreground">{said(file.name)}</span>}
          </div>
          {file.error ? (
            <span className="text-xs text-destructive">{said(file.error)}</span>
          ) : (
            <>
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                {[...events].map(([event, n]) => `${label(event)} ${n.toLocaleString()}`).join(" · ") || tr("No solves")}
                {dates.length > 0 && ` · ${day.format(dates.reduce((a, b) => Math.min(a, b)))} – ${day.format(dates.reduce((a, b) => Math.max(a, b)))}`}
              </span>
              {skipped.length > 0 && (
                <span className="text-xs text-muted-foreground">{tr("Left out:")}{" "}{skipped.map(([reason, n]) => `${n.toLocaleString()} (${reason})`).join(", ")}</span>
              )}
            </>
          )}
        </div>
        {read?.needsEvent && (
          <Select items={EVENT_ITEMS} value={file.event} onValueChange={(value) => onEvent(value as EventId)}>
            <SelectTrigger size="sm" aria-label={tr("Event of {0}", { 0: file.name })} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {said(item.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Tip content={tr("Remove {0}", { 0: file.name })}>
          <Button variant="ghost" size="icon-sm" aria-label={tr("Remove {0}", { 0: file.name })} onClick={onRemove}>
            <X />
          </Button>
        </Tip>
      </Card>
    </li>
  );
}
