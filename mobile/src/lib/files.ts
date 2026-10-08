import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { exportFile } from "../../../src/client/lib/exportData";
import { api, local } from "../api";

/**
 * The account's data as a file (the web's downloads): written to the cache, then handed to Android's share sheet to
 * keep it in Files, Drive or a message. `csv` is the solves as a table, `json` everything, which Import reads back.
 */
export async function exportData(kind: "csv" | "json") {
  const { body, type, name } = exportFile(kind, await api.exportData(), local.current().username ?? "guest");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(body);
  await Sharing.shareAsync(file.uri, { mimeType: type, dialogTitle: name });
}

/** Files chosen in Android's picker, each with its name and text; none when the picker is dismissed. */
export async function pickTextFiles(): Promise<{ name: string; text: () => Promise<string> }[]> {
  const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
  if (picked.canceled) return [];
  return picked.assets.map(asset => ({ name: asset.name, text: () => new File(asset.uri).text() }));
}
