import "./src/platform/polyfills";
import { registerRootComponent } from "expo";
import { App } from "./App";
import "./src/platform/history";

registerRootComponent(App);
