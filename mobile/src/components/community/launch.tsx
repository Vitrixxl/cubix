import { Swords, Trophy } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { DEFAULT_PLAYERS, MAX_PLAYERS, formatText, playersLimit, type Conversation, type Format, type Group } from "../../../../src/client/lib/community";
import { EVENTS, type EventId } from "../../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { community } from "../../lib/social";
import { ChoiceButton, PuzzleIcon } from "../PuzzlePicker";
import { Sheet, SheetInput } from "../Sheet";
import { Field } from "./people";
import { tr } from "../../../../src/client/i18n";

/** What a conversation launches (the web's BattleDialog and TournamentDialog): a battle, and a group's tournament. */

const me = () => community.host.account().id;

/** A whole number typed in a field, kept between `min` and `max`. */
function NumberField({ label, value, min, max, onChange, placeholder }: { label: string; value: string; min: number; max: number; onChange: (value: string) => void; placeholder?: string }) {
  return <Field label={label}>
    <SheetInput value={value} keyboardType="number-pad" maxLength={3} placeholder={placeholder} accessibilityLabel={label}
      onChangeText={text => onChange(text.replace(/\D/g, ""))} onBlur={() => value && onChange(String(Math.max(min, Math.min(max, Number(value)))))} />
  </Field>;
}

/** The event and how a match is won, on one line: solves to take a set, sets to take the match. */
function FormatFields({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  return <View className="gap-2">
    <View className="flex-row items-end gap-3">
      <View className="flex-[1.4]">
        <Field label={tr("Event")}>
          <ChoiceButton label={tr("Event")} value={value.event} options={EVENTS.map(e => ({ id: e.id, label: e.label }))} onChange={event => onChange({ ...value, event })}
            prefix={<PuzzleIcon puzzle={value.event as EventId} size={16} />} className="justify-start" />
        </Field>
      </View>
      <View className="flex-1">
        <NumberField label={tr("Solves per set")} value={String(value.points)} min={1} max={15} onChange={v => onChange({ ...value, points: Math.max(1, Math.min(15, Number(v) || 1)) })} />
      </View>
      <View className="flex-1">
        <NumberField label={tr("Sets to win")} value={String(value.sets)} min={1} max={9} onChange={v => onChange({ ...value, sets: Math.max(1, Math.min(9, Number(v) || 1)) })} />
      </View>
    </View>
    <Text className="text-xs text-muted-foreground">{tr("{0}, on the same scrambles for both players.", { 0: formatText(value) })}</Text>
  </View>;
}

/** A battle launched from a conversation: against the friend, or in a group against a member or whoever takes it. */
export function BattleSheet({ conversation: c, group, open, onClose }: { conversation: Conversation; group?: Group; open: boolean; onClose: () => void }) {
  const [opponent, setOpponent] = useState("anyone"), [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 1 }), [busy, setBusy] = useState(false);
  const others = group?.members.filter(m => m.role !== "invited" && m.id !== me()) ?? [];
  return <Sheet open={open} onClose={onClose} title={c.kind === "direct" ? tr("Challenge {0}", { 0: c.with!.username }) : tr("New battle in {0}", { 0: c.group!.name })}
    description={tr("It shows in the conversation, and starts once your opponent accepts it.")}>
    {c.kind === "group" ? <Field label={tr("Against")}>
      <ChoiceButton label={tr("Opponent")} value={opponent} options={[{ id: "anyone", label: tr("Anyone in the group") }, ...others.map(m => ({ id: m.id, label: m.username }))]} onChange={setOpponent} className="justify-start" />
    </Field> : null}
    <FormatFields value={format} onChange={setFormat} />
    <Button disabled={busy} className="h-11 rounded-lg" onPress={async () => {
      setBusy(true);
      const done = await community.battle(c.id, { ...format, opponentId: c.kind === "direct" || opponent === "anyone" ? null : opponent });
      setBusy(false);
      if (done) onClose();
    }}>
      <Icon as={Swords} size={16} />
      <Text>{tr("Launch the battle")}</Text>
    </Button>
  </Sheet>;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** A moment as typed in the start field, on this device's clock: "2026-10-09 18:00". */
const startText = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** The moment a start field names, or NaN. */
const startOf = (text: string) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(text.trim()); return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!).getTime() : NaN; };

/** A group's tournament, organised by its owner or an admin; its card comes into the group's conversation. */
export function TournamentSheet({ group: g, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [starts, setStarts] = useState(""), [cap, setCap] = useState(String(DEFAULT_PLAYERS)),
    [format, setFormat] = useState<Format>({ event: "333", points: 3, sets: 2 }), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setStarts(startText(Date.now() + 86_400_000)); }, [open]);
  const startsAt = startOf(starts);
  // ponytail: the start is typed ("2026-10-09 18:00"); a native date and time picker needs a new dependency.
  return <Sheet open={open} onClose={onClose} title={tr("New tournament in {0}", { 0: g.name })} scroll
    description={tr("Its card goes to the group's conversation. Members register until it starts; the bracket is drawn at its start.")}>
    <Field label={tr("Name")}><SheetInput value={name} onChangeText={setName} maxLength={60} accessibilityLabel={tr("Name")} /></Field>
    <FormatFields value={format} onChange={setFormat} />
    <View className="flex-row gap-3">
      <View className="flex-[1.4]"><Field label={tr("Starts")}>
        <SheetInput value={starts} onChangeText={setStarts} accessibilityLabel={tr("Starts")} placeholder="2026-10-09 18:00" keyboardType="numbers-and-punctuation" className={Number.isNaN(startsAt) ? "border-destructive" : undefined} />
      </Field></View>
      <View className="flex-1"><NumberField label={tr("Most players")} value={cap} min={2} max={MAX_PLAYERS} onChange={setCap} /></View>
    </View>
    <Field label={tr("Description")}><SheetInput value={description} onChangeText={setDescription} maxLength={500} multiline accessibilityLabel={tr("Description")} className="min-h-16 py-2.5" textAlignVertical="top" /></Field>
    <Button disabled={busy || name.trim().length < 2 || Number.isNaN(startsAt)} className="h-11 rounded-lg" onPress={async () => {
      setBusy(true);
      const done = await community.createTournament(g.id, { ...format, name: name.trim(), description: description.trim(), startsAt, maxPlayers: playersLimit(cap) });
      setBusy(false);
      if (done) { onClose(); setName(""); setDescription(""); }
    }}>
      <Icon as={Trophy} size={16} />
      <Text>{tr("Create the tournament")}</Text>
    </Button>
  </Sheet>;
}
