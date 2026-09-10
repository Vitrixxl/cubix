import type { UserDto } from "../../shared/types";
export function Avatar({ user, large = false }: { user: Pick<UserDto, "username">; large?: boolean }) {
  return <span className={`avatar ${large ? "large" : ""}`} aria-hidden="true"><span className="avatar-initials">{user.username.trim().slice(0, 2).toUpperCase()}</span></span>;
}

