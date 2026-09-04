/**
 * Electrobun main process (Bun runtime): starts the Elysia API on localhost and opens the window.
 */
import { BrowserWindow } from "electrobun/main";
import { createApi } from "./api";
import { openDb } from "./db";

const PREFERRED_PORT = 47129;

const db = openDb();
const api = createApi(db);

function listen(port: number) {
  return api.listen({ port, hostname: "127.0.0.1" });
}

let app;
try {
  app = listen(PREFERRED_PORT);
} catch {
  app = listen(0); // preferred port busy → any free port
}
const port = app.server?.port ?? PREFERRED_PORT;
const apiUrl = `http://127.0.0.1:${port}`;
console.log(`Cubix API listening on ${apiUrl} (db: ${db.path})`);

new BrowserWindow({
  title: "Cubix",
  url: `views://mainview/index.html?api=${encodeURIComponent(apiUrl)}`,
  frame: { width: 1440, height: 900 },
});
