import { Users } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import type { Conversation } from "../../../../src/client/lib/community";

/** A group's face beside its name, where a person has an avatar. */
export function GroupMark({ size = 40 }: { size?: number }) {
  return <View className="shrink-0 items-center justify-center rounded-full bg-muted" style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <Icon as={Users} size={size > 30 ? 16 : 14} className="text-muted-foreground" />
  </View>;
}

export const title = (c: Conversation) => (c.kind === "group" ? c.group!.name : c.with!.username);
export const organiser = (role: string | undefined) => role === "owner" || role === "admin";
