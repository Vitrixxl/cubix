import { useAtom } from "jotai";
import { threeDEnabledAtom } from "../state";

export function ThreeDSetting() {
  const [enabled, setEnabled] = useAtom(threeDEnabledAtom);
  return <div className="animation-setting">
    <strong>3D puzzles</strong>
    <button type="button" className={`switch ${enabled ? "on" : ""}`} role="switch" aria-label="3D puzzles" aria-checked={enabled} onClick={() => setEnabled(value => !value)}>
      <span className="switch-track" /><span>{enabled ? "On" : "Off"}</span>
    </button>
  </div>;
}
