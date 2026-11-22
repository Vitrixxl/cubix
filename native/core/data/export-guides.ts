// Writes the guides (src/client/lib/guides.ts) as JSON for the native app: bun native/core/data/export-guides.ts
import { GUIDES, GUIDE_TEXT } from "../../../src/client/lib/guides";
const guides = Object.entries(GUIDES).map(([id, g]) => ({ id, name: g.name, heading: g.heading, blocks: GUIDE_TEXT[id as keyof typeof GUIDES] }));
await Bun.write(new URL("./guides.json", import.meta.url), JSON.stringify(guides));
