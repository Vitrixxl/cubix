/**
 * On the web the app starts once its storage is read (IndexedDB, shared with the desktop app: storage.web.ts): the
 * state and the address's route read it synchronously as soon as they load.
 */
import { registerRootComponent } from "expo";
import { storageReady } from "./storage";

void storageReady.then(async () => {
  const { App } = await import("../../App");
  await import("./history");
  registerRootComponent(App);
});
