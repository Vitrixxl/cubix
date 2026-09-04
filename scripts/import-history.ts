/** Assign pre-account local history to an existing account, using local database access. */
import { openDb } from "../src/bun/db";
import { accounts } from "../src/bun/accounts";

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error("Usage: bun run import:history <username> (optionally set CUBIX_DB)");
  process.exit(1);
}
const store = openDb();
try {
  const user = accounts(store).byUsername(username);
  if (!user) throw new Error(`Account @${username} does not exist. Create it in Cubix first.`);
  const counts = store.db.transaction(() => {
    const sessions = store.db.query("UPDATE sessions SET user_id = ? WHERE user_id IS NULL").run(user.id).changes;
    const solves = store.db.query("UPDATE solves SET user_id = ? WHERE user_id IS NULL").run(user.id).changes;
    return { sessions, solves };
  })();
  console.log(`Imported ${counts.solves} legacy times and ${counts.sessions} sessions into @${user.username}. Reload Cubix to see them.`);
} finally { store.db.close(); }
