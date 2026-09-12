import { useAtom } from "jotai";
import { useMemo } from "react";
import { solved } from "../../shared/cube";
import { CUBE_BRANDS, type CubeBrandId } from "../lib/cube-brands";
import { cubeBrandAtom } from "../state";
import { Cube3D } from "./Cube3D";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Pick the maker whose mark is printed on the white centre of every 3D cube. */
export function CubeBrandSetting() {
  const [brand, setBrand] = useAtom(cubeBrandAtom);
  const preview = useMemo(() => solved(3), []);
  return <div className="animation-setting cube-brand-setting">
    <div><strong>Cube brand</strong><p>Shows the maker's logo on the white centre.</p></div>
    <div className="cube-brand-controls">
      <Cube3D state={preview} size={64} rotation={{ x: 38, y: -40 }} interactive={false} />
      <Select value={brand} onValueChange={value => setBrand(value as CubeBrandId)}>
        <SelectTrigger aria-label="Cube brand"><SelectValue /></SelectTrigger>
        <SelectContent>{CUBE_BRANDS.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  </div>;
}
