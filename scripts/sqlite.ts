/** Local tooling only. The running application uses Rust/rusqlite. */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export class Database {
  private connection: DatabaseSync;
  constructor(path: string) { this.connection = new DatabaseSync(path); this.connection.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;'); }
  exec(sql: string) { this.connection.exec(sql); }
  close() { this.connection.close(); }
  query<T = Record<string, unknown>, P extends unknown[] = unknown[]>(sql: string) {
    const stmt = this.connection.prepare(sql);
    return {
      get: (...params: P) => (stmt.get(...params as SQLInputValue[]) as T | undefined) ?? null,
      all: (...params: P) => stmt.all(...params as SQLInputValue[]) as T[],
      run: (...params: P) => stmt.run(...params as SQLInputValue[]),
    };
  }
  transaction<T>(fn: () => T) {
    return () => {
      this.exec('BEGIN IMMEDIATE');
      try { const result = fn(); this.exec('COMMIT'); return result; }
      catch (error) { this.exec('ROLLBACK'); throw error; }
    };
  }
}
export function openDb(path: string) {
  const initialized = spawnSync(resolve('rust-api/target/release/cubix-api'), ['--init-db'], {
    env: { ...process.env, CUBIX_DB: path }, encoding: 'utf8',
  });
  if (initialized.status !== 0) throw new Error(initialized.stderr || 'Build the Rust API first.');
  return { path, db: new Database(path) };
}
