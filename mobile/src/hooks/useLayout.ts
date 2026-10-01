import { useWindowDimensions } from "react-native";
import { isPhone } from "../../../src/client/lib/viewport";

/** The window's size and the web stylesheet's phone breakpoint (`@media (max-width: 700px)`). */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, phone: isPhone(width) };
}
