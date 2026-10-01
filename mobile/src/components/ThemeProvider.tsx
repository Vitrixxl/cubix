import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useAtomValue } from "jotai";
import { VariableContextProvider } from "nativewind";
import { useEffect, useMemo, type ReactNode } from "react";
import { Appearance, View } from "react-native";
import { colorModeAtom, themeAtom } from "../state";
import { buildColors, ColorsContext } from "../theme";

/**
 * The accent and the mode chosen in the settings drive every colour: the NativeWind variables (`bg-card`,
 * `text-primary`…), the plain colours of drawings (`useColors`), `dark:` classes (the app's colour scheme), the status
 * and navigation bars and the window behind the app.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const id = useAtomValue(themeAtom), mode = useAtomValue(colorModeAtom);
  const colors = useMemo(() => buildColors(id, mode), [id, mode]);
  // `dark:` classes follow the app's scheme, which must be right from the first frame.
  if (Appearance.getColorScheme() !== mode) Appearance.setColorScheme(mode);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors, mode]);
  return <ColorsContext.Provider value={colors}>
    <VariableContextProvider value={colors.variables}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <NavigationBar style={mode === "dark" ? "dark" : "light"} />
      <View className="flex-1 bg-background">{children}</View>
    </VariableContextProvider>
  </ColorsContext.Provider>;
}
