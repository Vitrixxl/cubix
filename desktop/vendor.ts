import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/** Copies cubing.js as separate modules into `<target>/cubing`, with its one bare dependency next to it.
 * Neither browsers nor standalone Bun executables resolve bare package names in external worker
 * modules consistently: keep module boundaries and point at the copied dependency. */
export async function copyCubing(target: string) {
  await mkdir(target, { recursive: true });
  await cp("node_modules/cubing/dist/lib/cubing", join(target, "cubing"), { recursive: true });
  await mkdir(join(target, "node_modules"), { recursive: true });
  await cp("node_modules/random-uint-below", join(target, "node_modules/random-uint-below"), { recursive: true, dereference: true });
  const dependency = join(target, "node_modules/random-uint-below/dist/esm/index.js");
  async function explicitImports(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await explicitImports(path);
      else if (path.endsWith(".js")) {
        const before = await readFile(path, "utf8");
        const specifier = relative(dirname(path), dependency).replaceAll("\\", "/");
        const after = before.replaceAll('from "random-uint-below"', `from "${specifier.startsWith(".") ? specifier : "./" + specifier}"`);
        if (after !== before) await writeFile(path, after);
      }
    }
  }
  await explicitImports(join(target, "cubing"));
}
