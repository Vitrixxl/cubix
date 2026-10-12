import { useAtomValue, useSetAtom } from "jotai";
import { BookA, BookOpen, Bluetooth, Coffee, LogIn, LogOut, Settings, Upload, UserRound } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { level } from "../../../src/client/lib/achievements";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { api } from "../api";
import { profileAchievementsAtom } from "../profile";
import { guestModeAtom, guidesAtom, notationAtom, routeAtom, userAtom } from "../state";
import { tr } from "../../../src/client/i18n";
import { ImportSheet } from "./ImportTimes";
import { Bar, MenuItem, Numeric } from "./layout";
import { UserAvatar } from "./UserAvatar";

const COFFEE = "https://buymeacoffee.com/vitrixxl";

/**
 * The account's face in the app bar, opening its menu: the account's card (its level, its XP and its achievements),
 * then the profile, the settings, the guides, the notation, importing times, the smart cube, the coffee and signing
 * out.
 */
export function AccountMenu() {
  const user = useAtomValue(userAtom);
  const navigate = useSetAtom(routeAtom), openGuides = useSetAtom(guidesAtom), openNotation = useSetAtom(notationAtom), setGuest = useSetAtom(guestModeAtom);
  const [importing, setImporting] = useState(false);
  const signedIn = !!user && !user.isGuest;
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Account")} className="size-11 items-center justify-center rounded-full active:opacity-70">
          <UserAvatar user={user} size={34} />
        </Pressable>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-3xl p-2 shadow-none">
        {signedIn && <AccountCard />}
        <MenuItem icon={UserRound} onPress={() => navigate({ page: "profile" })}>{tr("Profile")}</MenuItem>
        <MenuItem icon={Settings} onPress={() => navigate({ page: "settings" })}>{tr("Settings")}</MenuItem>
        <MenuItem icon={BookOpen} onPress={() => openGuides("about")}>{tr("Guides")}</MenuItem>
        <MenuItem icon={BookA} onPress={() => openNotation(true)}>{tr("Notation")}</MenuItem>
        <MenuItem icon={Upload} onPress={() => setImporting(true)}>{tr("Import times")}</MenuItem>
        {/* The phone has no Bluetooth link yet: the guide says which cubes work and how. */}
        <MenuItem icon={Bluetooth} onPress={() => openGuides("smartCube")}>{tr("Connect a cube")}</MenuItem>
        <DropdownMenuItem className="min-h-11 gap-3 px-3" onPress={() => void Linking.openURL(COFFEE)}>
          <Icon as={Coffee} size={17} className="text-primary" />
          <Text className="text-base font-bold text-primary">{tr("Buy me a coffee")}</Text>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {signedIn ? <MenuItem icon={LogOut} destructive onPress={() => void api.logout()}>{tr("Log out")}</MenuItem>
          : <MenuItem icon={LogIn} onPress={() => setGuest(false)}>{tr("Sign in")}</MenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <ImportSheet open={importing} onClose={() => setImporting(false)} />
  </>;
}

/** The menu's head, warm in the accent: the face, the name, the achievements unlocked, then the level and its XP. */
function AccountCard() {
  const user = useAtomValue(userAtom)!;
  const summary = useAtomValue(profileAchievementsAtom), xp = summary?.xp ?? 0, l = level(xp);
  return <View className="mb-1 gap-3 rounded-2xl bg-primary/15 p-3">
    <View className="flex-row items-center gap-3">
      <UserAvatar user={user} size={52} className="rounded-2xl" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-xl font-extrabold tracking-[-0.03em]">{user.username}</Text>
        {summary && <Text numberOfLines={1} className="text-xs font-semibold text-muted-foreground">
          {tr("{0} of {1} achievements unlocked", { 0: summary.unlocked, 1: summary.total })}
        </Text>}
      </View>
    </View>
    <View className="gap-2 rounded-xl bg-popover px-3 py-2.5" accessibilityLabel={tr("{0} XP in all", { 0: xp.toLocaleString() })}>
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="text-base font-extrabold">{tr("Level {0}", { 0: l.level })}</Text>
        <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} / {1} XP", { 0: l.into.toLocaleString(), 1: l.span.toLocaleString() })}</Numeric>
      </View>
      <Bar ratio={l.into / l.span} className="h-2" />
    </View>
  </View>;
}
