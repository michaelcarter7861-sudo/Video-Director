/**
 * Font loading. OFL fonts shipped as npm packages (@fontsource) — no network at render time.
 * @napi-rs/canvas reads .woff directly, which is why we don't need .ttf conversion.
 */
import { GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

type Face = { pkg: string; file: string; family: string };

const FACES: Face[] = [
  { pkg: '@fontsource/inter', file: 'inter-latin-400-normal.woff', family: 'Inter' },
  { pkg: '@fontsource/inter', file: 'inter-latin-500-normal.woff', family: 'Inter' },
  { pkg: '@fontsource/inter', file: 'inter-latin-700-normal.woff', family: 'Inter' },
  { pkg: '@fontsource/inter', file: 'inter-latin-800-normal.woff', family: 'Inter' },
  { pkg: '@fontsource/space-grotesk', file: 'space-grotesk-latin-500-normal.woff', family: 'Space Grotesk' },
  { pkg: '@fontsource/space-grotesk', file: 'space-grotesk-latin-700-normal.woff', family: 'Space Grotesk' },
  { pkg: '@fontsource/jetbrains-mono', file: 'jetbrains-mono-latin-400-normal.woff', family: 'JetBrains Mono' },
  { pkg: '@fontsource/jetbrains-mono', file: 'jetbrains-mono-latin-500-normal.woff', family: 'JetBrains Mono' },
  { pkg: '@fontsource/jetbrains-mono', file: 'jetbrains-mono-latin-700-normal.woff', family: 'JetBrains Mono' },
];

let loaded = false;

export function loadFonts(): void {
  if (loaded) return;
  for (const face of FACES) {
    const pkgJson = require.resolve(`${face.pkg}/package.json`);
    const filePath = path.join(path.dirname(pkgJson), 'files', face.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Font file missing: ${filePath}. Run npm ci.`);
    }
    const key = GlobalFonts.registerFromPath(filePath, face.family);
    if (!key) throw new Error(`Could not register font ${face.family} from ${filePath}`);
  }
  loaded = true;
}

/** Full CSS-ish font shorthand for canvas. */
export function font(family: string, weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px "${family}"`;
}
