import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";
import type { UserDto } from "../shared/types";

export interface UserRow {
  id: string; username: string; display_name: string; bio: string;
  password_hash: string | null; is_private: number; created_at: string;
}
export const publicUser = (u: UserRow): UserDto => ({
  id: u.id, username: u.username, displayName: u.display_name, bio: u.bio,
  isPrivate: !!u.is_private, isGuest: !u.password_hash, createdAt: u.created_at,
});
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export function accounts({ db }: Db) {
  const byId = (id: string) => db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?").get(id);
  return {
    byId,
    byUsername: (name: string) => db.query<UserRow, [string]>("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND password_hash IS NOT NULL").get(name),
    authenticate: (authorization: string | null) => {
      if (!authorization?.startsWith("Bearer ")) return null;
      return db.query<UserRow, [string, number]>("SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id = u.id WHERE t.token_hash = ? AND t.expires_at > ?").get(digest(authorization.slice(7)), Date.now());
    },
    issue: (user: UserRow) => {
      const token = randomBytes(32).toString("hex");
      db.query("DELETE FROM auth_tokens WHERE expires_at <= ?").run(Date.now());
      db.query("INSERT INTO auth_tokens VALUES (?, ?, ?)").run(digest(token), user.id, Date.now() + 30 * 86400000);
      return { token, user: publicUser(user) };
    },
    revoke: (authorization: string | null) => {
      if (authorization?.startsWith("Bearer ")) db.query("DELETE FROM auth_tokens WHERE token_hash = ?").run(digest(authorization.slice(7)));
    },
    guest: () => {
      const id = crypto.randomUUID();
      db.query("INSERT INTO users (id, username, display_name) VALUES (?, ?, 'Guest')").run(id, `guest-${id}`);
      return byId(id)!;
    },
    register: (username: string, displayName: string, hash: string, guestId?: string) => db.transaction(() => {
      const id = guestId ?? crypto.randomUUID();
      if (guestId) {
        db.query("UPDATE users SET username = ?, display_name = ?, password_hash = ? WHERE id = ? AND password_hash IS NULL").run(username, displayName, hash, id);
        // Rotate every anonymous token when the guest becomes a password-protected account.
        db.query("DELETE FROM auth_tokens WHERE user_id = ?").run(id);
      } else db.query("INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)").run(id, username, displayName, hash);
      return byId(id)!;
    })(),
    update: (id: string, displayName: string, bio: string, isPrivate: boolean) => {
      db.query("UPDATE users SET display_name = ?, bio = ?, is_private = ? WHERE id = ?").run(displayName, bio, Number(isPrivate), id);
      return publicUser(byId(id)!);
    },
    search: (query: string) => db.query<UserRow, [string, string]>(
      "SELECT * FROM users WHERE password_hash IS NOT NULL AND is_private = 0 AND (instr(lower(username), ?) > 0 OR instr(lower(display_name), ?) > 0) ORDER BY username LIMIT 30"
    ).all(query.toLowerCase(), query.toLowerCase()).map(publicUser),
  };
}
