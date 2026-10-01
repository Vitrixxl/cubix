import { CloudAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SyncStatus } from "../../../src/client/local/client";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { local, syncStatusChanged } from "../api";

/**
 * A change that could not reach the server: a pill over the tab bar, a tap retries. (An expired session needs no
 * pill: the app returns to the sign-in screen.)
 */
export function SyncIndicator({ hidden }: { hidden: boolean }) {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SyncStatus>(local.status);
  useEffect(() => syncStatusChanged.on(setStatus), []);
  if (hidden || status.state !== "error") return null;
  return <View pointerEvents="box-none" className="absolute right-0 left-0 items-center" style={{ bottom: Math.max(insets.bottom, 8) + 72 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Couldn't save. Retry" onPress={() => void local.retry()}
      className="flex-row items-center gap-2 rounded-full bg-destructive px-4 py-2.5 shadow-lg active:opacity-80">
      <Icon as={CloudAlert} size={16} className="text-white" />
      <Text className="text-sm font-semibold text-white">Couldn't save · Retry</Text>
    </Pressable>
  </View>;
}
