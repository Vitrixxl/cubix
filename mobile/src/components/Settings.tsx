import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, BookOpen, Check, LogOut, Moon, Sun } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { joinedDate } from "../../../src/client/lib/format";
import { THEMES } from "../../../src/client/lib/theme";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { updateAvailable } from "../lib/release";
import { APK_DOWNLOAD_URL, APP_BUILD, APP_COMMIT, APP_RUNTIME, APP_VERSION, latestReleaseAtom, restartWithUpdate, useOtaCheck, useOtaPending, useReleaseCheck } from "../release";
import { colorModeAtom, guidesAtom, notationAtom, settingsOpenAtom, themeAtom, userAtom } from "../state";
import { Label, ListGroup, ListRow } from "./layout";
import { Sheet } from "./Sheet";
import { UserAvatar } from "./UserAvatar";

/**
 * The settings, as the web's dialog but in a tall sheet: the account and, apart, signing out, the appearance (mode and accent)
 * and, on the native app, the guides and the installed version.
 */
export function SettingsSheet() {
  const [open, setOpen] = useAtom(settingsOpenAtom);
  useReleaseCheck(open);
  useOtaCheck(open);
  return <Sheet open={open} onClose={() => setOpen(false)} title="Settings" scroll contentClassName="gap-6">
    <Appearance />
    <Help onOpen={() => setOpen(false)} />
    <Account onSignedOut={() => setOpen(false)} />
    <Version />
  </Sheet>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View className="gap-2">
    <Label className="px-1 text-[13px]">{title}</Label>
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
  return <ListGroup title="Account">
    <ListRow first iconNode={<UserAvatar user={user} size={40} />} title={user.username} detail={`Joined ${joinedDate(user.createdAt)} · synced`} />
    <ListRow icon={LogOut} title={<Text className="text-[15px] font-medium text-destructive">{busy ? "Logging out…" : "Log out"}</Text>} chevron={false} disabled={busy}
      accessibilityLabel="Log out" onPress={() => void signOut()} />
  </ListGroup>;
}

function Appearance() {
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <Section title="Appearance">
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row rounded-xl bg-muted p-1" accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {([["dark", "Dark", Moon], ["light", "Light", Sun]] as const).map(([id, label, I]) => {
          const on = mode === id;
          return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setMode(id)}
            className={cn("h-10 flex-1 flex-row items-center justify-center gap-2 rounded-lg", on && "bg-background")}>
            <Icon as={I} size={16} className={on ? "text-foreground" : "text-muted-foreground"} />
            <Text className={cn("text-sm", on ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{label}</Text>
          </Pressable>;
        })}
      </View>
      <View className="flex-row justify-between" accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
        {THEMES.map(item => {
          const on = theme === item.id;
          return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: on }} onPress={() => setTheme(item.id)}
            className="size-11 items-center justify-center" style={{ borderRadius: 999, borderWidth: 2, borderColor: on ? item.color : "transparent" }}>
            <View className="size-8 items-center justify-center" style={{ borderRadius: 999, backgroundColor: item.color }}>
              {on ? <Icon as={Check} size={16} className="text-white" /> : null}
            </View>
          </Pressable>;
        })}
      </View>
    </View>
  </Section>;
}

function Help({ onOpen }: { onOpen: () => void }) {
  const openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom);
  return <ListGroup title="Help">
    <ListRow first icon={BookOpen} title="Guides" detail="How each part of Qbix works" onPress={() => { onOpen(); openGuides("about"); }} />
    <ListRow icon={BookA} title="Notation" detail="What every move letter means" onPress={() => { onOpen(); openNotation(true); }} />
  </ListGroup>;
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
    <View className="flex-row flex-wrap items-center justify-between gap-3 px-1">
      <Text className="text-xs text-muted-foreground" accessibilityLabel="Installed version">Qbix {APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}</Text>
      {pending && <Button size="sm" onPress={() => void restartWithUpdate()}><Text>Restart to update</Text></Button>}
      {outdated && <Button size="sm" accessibilityHint={`Build ${latest?.apkCommit?.slice(0, 7)}`} onPress={() => void Linking.openURL(APK_DOWNLOAD_URL)}><Text>Download update</Text></Button>}
    </View>
  </View>;
}
