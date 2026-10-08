import { getLocales } from "expo-localization";
import { useSyncExternalStore } from "react";
import { language, onLanguage, setDevice, start } from "../../src/client/i18n";
import { storage } from "./platform/storage";

/**
 * The app's languages on the phone (src/client/i18n): the choice kept in MMKV beside the other preferences, the
 * phone's own languages until one is chosen. Importing this module starts it.
 */
setDevice({ storage, languages: () => getLocales().map(l => l.languageTag) });
void start();

/** The current language, drawing again when it changes. */
export const useLanguage = () => useSyncExternalStore(onLanguage, language);

export { LANGUAGES, setLanguage, tr, type Language } from "../../src/client/i18n";
