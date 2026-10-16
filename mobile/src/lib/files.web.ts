import { exportFile } from "../../../src/client/lib/exportData";
import { api, local } from "../api";

/** The account's data as a file, downloaded by the browser (files.ts hands it to Android's share sheet). */
export async function exportData(kind: "csv" | "json") {
  const { body, type, name } = exportFile(kind, await api.exportData(), local.current().username ?? "guest");
  await saveFile(body, type, name);
}

/** A file made in the app (an export), downloaded by the browser. */
export async function saveFile(body: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Files chosen in the browser's picker, each with its name and text; none when it is dismissed. */
export function pickTextFiles(): Promise<{ name: string; text: () => Promise<string> }[]> {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement("input"), { type: "file", multiple: true });
    input.onchange = () => resolve(Array.from(input.files ?? []).map(file => ({ name: file.name, text: () => file.text() })));
    input.oncancel = () => resolve([]);
    input.click();
  });
}
