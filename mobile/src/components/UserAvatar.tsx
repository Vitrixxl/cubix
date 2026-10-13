import { User } from "lucide-react-native";
import { View } from "react-native";
import type { UserDto } from "../../../src/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * The player's face: the initials of the account on the accent, a person without one. `className` shapes it (a
 * rounded square on the profile and in the settings, a disc elsewhere).
 */
export function UserAvatar({ user, size = 32, className }: { user: Pick<UserDto, "username" | "isGuest"> | null; size?: number; className?: string }) {
  if (!user || user.isGuest) return <View className={cn("items-center justify-center rounded-full bg-muted", className)} style={{ width: size, height: size }}>
    <Icon as={User} size={Math.round(size * 0.55)} className="text-muted-foreground" />
  </View>;
  const initials = user.username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  return <Avatar alt={user.username} className={cn("rounded-full", className)} style={{ width: size, height: size }}>
    <AvatarFallback className="rounded-none bg-primary">
      <Text className="font-extrabold tracking-[-0.02em] text-primary-foreground" style={{ fontSize: Math.max(9, Math.round(size * 0.36)) }}>{initials}</Text>
    </AvatarFallback>
  </Avatar>;
}
