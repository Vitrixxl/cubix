import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, BookOpen, Check, ChevronRight, LogOut, Moon, Sun } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { joinedDate } from "../../../src/client/lib/format";
import { THEMES } from "../../../src/client/lib/theme";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_RUNTIME, APP_VERSION, latestReleaseAtom, restartWithUpdate, useOtaCheck, useOtaPending, useReleaseCheck } from "../release";
import { colorModeAtom, guidesAtom, notationAtom, settingsOpenAtom, themeAtom, userAtom } from "../state";
import { Label } from "./layout";
import { Sheet } from "./Sheet";
import { UserAvatar } from "./UserAvatar";

/**
 * The settings, as the web's dialog but in a tall sheet: the account and its sign-out, the appearance (mode and accent)
 * and, on the native app, the guides and the installed version.
 */
export function SettingsSheet() {
  const [open, setOpen] = useAtom(settingsOpenAtom);
  useReleaseCheck(open);
  useOtaCheck(open);
  return <Sheet open={open} onClose={() => setOpen(false)} title="Settings" tall scroll contentClassName="gap-6">
    <Account onSignedOut={() => setOpen(false)} />
    <Appearance />
    <Help onOpen={() => setOpen(false)} />
    <Version />
  </Sheet>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View className="gap-3">
    <Label>{title}</Label>
    {children}
  </View>;
}

function Account({ onSignedOut }: { onSignedOut: () => void }) {
  const user = useAtomValue(userAtom);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const signOut = async () => {
    setBusy(true);
    try { await api.logout(); onSignedOut(); } finally { setBusy(false); }
  };
  return <Section title="Account">
    <View className="flex-row items-center gap-3 rounded-xl bg-muted/40 p-3">
      <UserAvatar user={user} size={44} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-semibold">{user.username}</Text>
        <Text className="text-xs text-muted-foreground">Joined {joinedDate(user.createdAt)} · synced</Text>
      </View>
      <Button variant="outline" size="sm" className="h-10 gap-2" disabled={busy} onPress={() => void signOut()}>
        <Icon as={LogOut} size={15} />
        <Text>{busy ? "Signing out…" : "Sign out"}</Text>
      </Button>
    </View>
  </Section>;
}

function Appearance() {
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <Section title="Appearance">
    <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Theme">
      {([["dark", "Dark", Moon], ["light", "Light", Sun]] as const).map(([id, label, I]) => {
        const on = mode === id;
        return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setMode(id)}
          className={cn("h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg", on ? "bg-primary/15" : "bg-muted/40 active:bg-muted")}>
          <Icon as={I} size={17} className={on ? "text-foreground" : "text-muted-foreground"} />
          <Text className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
        </Pressable>;
      })}
    </View>
    <View className="flex-row justify-between" accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
      {THEMES.map(item => {
        const on = theme === item.id;
        return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: on }} onPress={() => setTheme(item.id)}
          className={cn("size-12 items-center justify-center rounded-full border-2", on ? "border-foreground" : "border-transparent")}>
          <View className="size-9 items-center justify-center rounded-full" style={{ backgroundColor: item.color }}>
            {on ? <Icon as={Check} size={18} className="text-white" /> : null}
          </View>
        </Pressable>;
      })}
    </View>
  </Section>;
}

function Help({ onOpen }: { onOpen: () => void }) {
  const openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom);
  return <Section title="Help">
    <Pressable accessibilityRole="button" onPress={() => { onOpen(); openNotation(true); }} className="h-12 flex-row items-center gap-3 rounded-lg bg-muted/40 px-3 active:bg-muted">
      <Icon as={BookA} size={18} className="text-muted-foreground" />
      <Text className="flex-1 text-[15px]">Notation</Text>
      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => { onOpen(); openGuides("about"); }} className="h-12 flex-row items-center gap-3 rounded-lg bg-muted/40 px-3 active:bg-muted">
      <Icon as={BookOpen} size={18} className="text-muted-foreground" />
      <Text className="flex-1 text-[15px]">Guides</Text>
      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
    </Pressable>
  </Section>;
}

/**
 * The installed build. A JavaScript update fetched over the air only needs a restart; a new native build needs the APK
 * the server announces.
 */
function Version() {
  const latest = useAtomValue(latestReleaseAtom);
  const pending = useOtaPending();
  const outdated = !pending && updateAvailable(APP_BUILD, latest, APP_RUNTIME);
  return <View className="gap-3">
    <Separator />
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <Text className="text-xs text-muted-foreground" accessibilityLabel="Installed version">Cubix {APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
      {pending && <Button size="sm" onPress={() => void restartWithUpdate()}><Text>Restart to update</Text></Button>}
      {outdated && <Button size="sm" accessibilityHint={`Build ${latest?.apkCommit?.slice(0, 7)}`} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)}><Text>Download update</Text></Button>}
    </View>
  </View>;
}
