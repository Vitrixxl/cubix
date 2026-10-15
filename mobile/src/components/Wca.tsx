/**
 * The player's WCA ID (src/client/lib/wca.ts), as on the web (desktop/renderer/profile/wca.tsx): the pill beside the
 * name opens their page in the WCA pages (WcaPage); a WCA ID not given yet is typed in a sheet first, the person found
 * shown before it is linked.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { plural } from "../../../src/client/lib/format";
import { PROFILE_KEY, journeyProfile, type JourneyProfile } from "../../../src/client/lib/journey";
import { wcaIdOf, wcaUrl, type WcaPerson } from "../../../src/client/lib/wca";
import { said, tr } from "../../../src/client/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { api, local } from "../api";
import { openUrl } from "../lib/social";
import { Sheet } from "./Sheet";

/** Links `id` to the player's profile (none: unlinks it), then opens their page; why it failed, if it did. */
export async function linkWca(id?: string): Promise<string | undefined> {
  const profile = journeyProfile(local.read.journey());
  if (!profile) return;
  const { wcaId: _, ...rest } = profile;
  try {
    await api.updateJourney({ [PROFILE_KEY]: id ? { ...rest, wcaId: id } : rest });
    if (id) openUrl(wcaUrl("persons/" + id));
  } catch (e) {
    return said((e as Error).message);
  }
}

/** The pill beside the name: the player's WCA page, or the sheet to link their WCA ID. */
export function WcaPill({ profile }: { profile: JourneyProfile }) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={profile.wcaId ? `WCA ${profile.wcaId}` : tr("WCA ID")} hitSlop={10}
      onPress={() => (profile.wcaId ? openUrl(wcaUrl("persons/" + profile.wcaId)) : setOpen(true))}
      className="h-6 flex-row items-center rounded-full bg-muted px-2.5 active:bg-accent">
      <Text className="text-xs font-bold text-muted-foreground">WCA</Text>
    </Pressable>
    <Sheet open={open} onClose={() => setOpen(false)} title="WCA" scroll contentClassName="gap-3">
      {open ? <LinkForm onDone={() => setOpen(false)} /> : null}
    </Sheet>
  </>;
}

/** The WCA ID typed, the person it names found, then linked. */
function LinkForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState(""), [found, setFound] = useState<WcaPerson | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const id = wcaIdOf(text);
  const find = async () => {
    if (!id || busy) return;
    setBusy(true); setError("");
    try { setFound(await api.wca<WcaPerson>("persons/" + id)); } catch (e) { setError(said((e as Error).message)); } finally { setBusy(false); }
  };
  const link = async (wcaId: string) => {
    setBusy(true);
    const failed = await linkWca(wcaId);
    setBusy(false);
    if (failed) setError(failed); else onDone();
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
      <Button disabled={busy} onPress={() => void link(found.id)}><Text>{tr("Link")}</Text></Button>
    </View> : null}
    <Button variant="ghost" className="self-start" onPress={() => { onDone(); openUrl(wcaUrl("persons")); }}><Text>{tr("Search people")}</Text></Button>
  </>;
}
