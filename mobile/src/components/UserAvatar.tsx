import { User } from "lucide-react-native";
import { View } from "react-native";
import type { UserDto } from "../../../src/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/** The player's face: the initials of the account, a person without one. */
export function UserAvatar({ user, size = 32 }: { user: Pick<UserDto, "username" | "isGuest"> | null; size?: number }) {
  if (!user || user.isGuest) return <View className="items-center justify-center rounded-full bg-muted" style={{ width: size, height: size }}>
    <Icon as={User} size={Math.round(size * 0.55)} className="text-muted-foreground" />
  </View>;
  const initials = user.username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  return <Avatar alt={user.username} className="rounded-full" style={{ width: size, height: size }}>
    <AvatarFallback className="bg-primary/15">
      <Text className="font-semibold text-primary" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>{initials}</Text>
    </AvatarFallback>
  </Avatar>;
}
