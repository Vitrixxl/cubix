import { readdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
/** Precompress public text assets once so the Rust server can serve them cheaply. */
export async function compressAssets(directory = 'dist/view') {
  for (const path of await readdir(directory, { recursive: true })) {
    if (!/\.(html|js|css|json|svg|xml|txt|webmanifest)$/.test(path)) continue;
    const data = await readFile(`${directory}/${path}`);
    if (data.length < 1024) continue;
    await Promise.all([
      writeFile(`${directory}/${path}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })),
      writeFile(`${directory}/${path}.gz`, gzipSync(data, { level: 9 })),
    ]);
  }
}
