/**
 * The player's WCA ID and official results (src/client/lib/wca.ts), as on the web (desktop/renderer/profile/wca.tsx):
 * a pill beside the name opens a sheet with their records per event, the Qbix bests beside; their competitions coming
 * up are behind a button, in a sheet of their own. A WCA ID not given yet is typed there, the person shown before it is saved.
 */
import { CalendarDays, ExternalLink, Pencil } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { fmtTime, plural, shortDate } from "../../../src/client/lib/format";
import { PROFILE_KEY, type JourneyProfile } from "../../../src/client/lib/journey";
import { wcaIdOf, wcaPersonUrl, wcaRanks, wcaResult, wcaRows, type WcaCompetitions, type WcaPerson, type WcaRecord } from "../../../src/client/lib/wca";
import type { EventRecordDto } from "../../../src/shared/types";
import { said, tr } from "../../../src/client/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { api } from "../api";
import { Empty, ListRow, Numeric } from "./layout";
import { Sheet } from "./Sheet";

/** The pill beside the name, and the sheet it opens. */
export function WcaPill({ profile, records }: { profile: JourneyProfile; records: readonly EventRecordDto[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={profile.wcaId ? `WCA ${profile.wcaId}` : tr("WCA ID")} onPress={() => setOpen(true)}
      className="h-6 flex-row items-center rounded-full bg-muted px-2.5 active:bg-accent">
      <Text className="text-xs font-bold text-muted-foreground">WCA</Text>
    </Pressable>
    <Sheet open={open} onClose={() => setOpen(false)} title="WCA" scroll contentClassName="gap-3">
      {open ? <WcaBody key={profile.wcaId ?? ""} profile={profile} records={records} /> : null}
    </Sheet>
  </>;
}

function WcaBody({ profile, records }: { profile: JourneyProfile; records: readonly EventRecordDto[] }) {
  const [editing, setEditing] = useState(!profile.wcaId);
  return editing || !profile.wcaId ? <LinkForm profile={profile} /> : <Results id={profile.wcaId} records={records} onEdit={() => setEditing(true)} />;
}

/** The WCA ID typed, the person it names found, then saved; or removed. */
function LinkForm({ profile }: { profile: JourneyProfile }) {
  const [text, setText] = useState(profile.wcaId ?? ""), [found, setFound] = useState<WcaPerson | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const id = wcaIdOf(text);
  const find = async () => {
    if (!id || busy) return;
    setBusy(true); setError("");
    try { setFound(await api.wcaPerson(id)); } catch (e) { setError(said((e as Error).message)); } finally { setBusy(false); }
  };
  const save = async (wcaId?: string) => {
    const { wcaId: _, ...rest } = profile;
    setBusy(true); setError("");
    try { await api.updateJourney({ [PROFILE_KEY]: wcaId ? { ...rest, wcaId } : rest }); } catch (e) { setError(said((e as Error).message)); setBusy(false); }
  };
  return <>
    <View className="flex-row gap-2">
      <Input value={text} onChangeText={v => { setText(v); setFound(null); setError(""); }} accessibilityLabel={tr("WCA ID")} placeholder="2009ZEMD01"
        autoCapitalize="characters" autoCorrect={false} onSubmitEditing={() => void find()} className="flex-1" />
      <Button variant="outline" disabled={!id || busy} onPress={() => void find()}><Text>{tr("Find")}</Text></Button>
    </View>
    {error ? <Alert variant="destructive">{error}</Alert> : null}
    {found ? <View className="flex-row items-center gap-3 rounded-2xl bg-muted px-3.5 py-2.5">
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-bold">{found.name}</Text>
        <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{[found.countryName, plural(found.competitions, "competition")].join(" · ")}</Text>
      </View>
      <Button disabled={busy} onPress={() => void save(found.id)}><Text>{tr("Link")}</Text></Button>
    </View> : null}
    {profile.wcaId ? <Button variant="ghost" className="self-start" disabled={busy} onPress={() => void save()}><Text>{tr("Remove")}</Text></Button> : null}
  </>;
}

/** A WCA result and its ranks. */
function Official({ event, kind, r }: { event: string; kind: "single" | "average"; r: WcaRecord }) {
  return <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
    <Numeric className="w-16 text-[15px] font-bold">{wcaResult(event, kind, r.best)}</Numeric>
    <Numeric numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">{wcaRanks(r)}</Numeric>
  </View>;
}

/** Who the WCA ID is, their records per event against the Qbix ones, and the way to their competitions. */
function Results({ id, records, onEdit }: { id: string; records: readonly EventRecordDto[]; onEdit: () => void }) {
  const [person, setPerson] = useState<WcaPerson | null>(null), [failed, setFailed] = useState(false), [competitions, setCompetitions] = useState(false);
  useEffect(() => {
    let live = true;
    api.wcaPerson(id).then(p => { if (live) setPerson(p); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  return <>
    <View className="flex-row items-center gap-1">
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-lg font-extrabold">{person?.name ?? id}</Text>
        {person ? <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{[id, person.countryName, plural(person.competitions, "competition")].join(" · ")}</Text> : null}
      </View>
      <Button variant="ghost" size="icon" accessibilityLabel={tr("Open on the WCA")} onPress={() => void Linking.openURL(wcaPersonUrl(id))}><Icon as={ExternalLink} size={18} /></Button>
      <Button variant="ghost" size="icon" accessibilityLabel={tr("Change")} onPress={onEdit}><Icon as={Pencil} size={18} /></Button>
    </View>
    {failed ? <Text className="text-[13px] text-muted-foreground">{tr("WCA unavailable")}</Text>
      : !person ? <Skeleton className="h-32 rounded-2xl" />
      : <>
        <Button variant="outline" className="h-11 rounded-lg" onPress={() => setCompetitions(true)}><Icon as={CalendarDays} size={16} /><Text>{tr("Competitions")}</Text></Button>
        <View accessibilityLabel={tr("Official results")} className="gap-1.5">
          {wcaRows(person, records).map(row => <View key={row.event} className="gap-1 rounded-2xl bg-muted px-3 py-2.5">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text numberOfLines={1} className="min-w-0 shrink text-xs font-bold text-muted-foreground">{said(row.label)}</Text>
              <Text className="text-xs font-bold text-muted-foreground">Qbix</Text>
            </View>
            <View className="flex-row items-baseline gap-2">
              <Official event={row.event} kind="single" r={row.single} />
              <Numeric className="text-[13px] font-semibold">{fmtTime(row.qbixSingle)}</Numeric>
            </View>
            {row.average ? <View className="flex-row items-baseline gap-2">
              <Official event={row.event} kind="average" r={row.average} />
              <Numeric className="text-[13px] font-semibold text-muted-foreground">{row.qbixAverage != null ? tr("Ao5 {0}", { 0: fmtTime(row.qbixAverage) }) : "–"}</Numeric>
            </View> : null}
          </View>)}
        </View>
        <Sheet open={competitions} onClose={() => setCompetitions(false)} title={tr("Competitions")} scroll contentClassName="gap-1 pb-4">
          {competitions ? <Upcoming id={id} country={person.countryName} /> : null}
        </Sheet>
      </>}
  </>;
}

/** Their competitions coming up, or their country's, each opening its WCA page. */
function Upcoming({ id, country }: { id: string; country: string }) {
  const [list, setList] = useState<WcaCompetitions | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.wcaCompetitions(id).then(v => { if (live) setList(v); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  if (failed) return <Text className="text-[13px] text-muted-foreground">{tr("WCA unavailable")}</Text>;
  if (!list) return <Skeleton className="h-16 rounded-2xl" />;
  if (!list.competitions.length) return <Empty icon={CalendarDays} title={tr("Nothing coming up")} />;
  const day = (iso: string) => shortDate(iso + "T12:00:00");
  return <>
    <Text className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{list.mine ? tr("Registered") : country}</Text>
    <View className="overflow-hidden rounded-2xl bg-muted">
      {list.competitions.map((c, i) => <ListRow key={c.id} first={i === 0} title={c.name} onPress={() => void Linking.openURL(c.url)}
        detail={[c.start_date === c.end_date ? day(c.start_date) : `${day(c.start_date)} – ${day(c.end_date)}`, c.city].filter(Boolean).join(" · ")} />)}
    </View>
  </>;
}
