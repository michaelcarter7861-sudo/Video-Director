/**
 * Brand tokens — single source of truth for palette, fonts, timing feel.
 * No hardcoded hex/rgb anywhere else in the engine.
 */

export type Palette = {
  id: string;
  bg: string;
  bgAlt: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentAlt: string;
  grid: string;
};

export const palettes: Record<string, Palette> = {
  'dark-tech': {
    id: 'dark-tech',
    bg: '#0B0B0F',
    bgAlt: '#14141B',
    fg: '#F5F5F7',
    fgMuted: '#8E8E93',
    accent: '#FF3B30',
    accentAlt: '#3DDC97',
    grid: '#22222C',
  },
  'paper-light': {
    id: 'paper-light',
    bg: '#F7F5F0',
    bgAlt: '#EDE9E1',
    fg: '#111114',
    fgMuted: '#6B6B72',
    accent: '#1F5FFF',
    accentAlt: '#E2452F',
    grid: '#D8D3C8',
  },
  'neon-noir': {
    id: 'neon-noir',
    bg: '#08060E',
    bgAlt: '#120C1F',
    fg: '#F2EFFF',
    fgMuted: '#9A93B8',
    accent: '#C7FF3D',
    accentAlt: '#FF3DAE',
    grid: '#241A38',
  },
  'mono-accent': {
    id: 'mono-accent',
    bg: '#101011',
    bgAlt: '#1A1A1C',
    fg: '#FFFFFF',
    fgMuted: '#8A8A8F',
    accent: '#FFB020',
    accentAlt: '#4DA3FF',
    grid: '#26262A',
  },
};

export type FontPair = {
  id: string;
  display: { family: string; weight: number; letterSpacing: number };
  body: { family: string; weight: number; letterSpacing: number };
  mono: { family: string; weight: number };
  uppercaseDisplay: boolean;
};

export const fontPairs: Record<string, FontPair> = {
  'space-inter': {
    id: 'space-inter',
    display: { family: 'Space Grotesk', weight: 700, letterSpacing: -1.5 },
    body: { family: 'Inter', weight: 500, letterSpacing: 0 },
    mono: { family: 'JetBrains Mono', weight: 500 },
    uppercaseDisplay: false,
  },
  'inter-bold': {
    id: 'inter-bold',
    display: { family: 'Inter', weight: 800, letterSpacing: -2.5 },
    body: { family: 'Inter', weight: 400, letterSpacing: 0 },
    mono: { family: 'JetBrains Mono', weight: 500 },
    uppercaseDisplay: true,
  },
  'mono-tech': {
    id: 'mono-tech',
    display: { family: 'JetBrains Mono', weight: 700, letterSpacing: -1 },
    body: { family: 'Inter', weight: 400, letterSpacing: 0 },
    mono: { family: 'JetBrains Mono', weight: 400 },
    uppercaseDisplay: true,
  },
};

export type TemplateFamily = {
  id: string;
  /** palette pool this family draws from */
  palettes: string[];
  fonts: string[];
  /** default motion intensity 1..3 */
  motion: number;
  /** how much the composition leans on accent colour */
  accentUsage: number;
};

export const templateFamilies: Record<string, TemplateFamily> = {
  'kinetic-doc': {
    id: 'kinetic-doc',
    palettes: ['dark-tech', 'mono-accent'],
    fonts: ['space-inter', 'inter-bold'],
    motion: 2,
    accentUsage: 0.5,
  },
  'terminal-explainer': {
    id: 'terminal-explainer',
    palettes: ['dark-tech', 'neon-noir'],
    fonts: ['mono-tech'],
    motion: 1,
    accentUsage: 0.8,
  },
  'data-story': {
    id: 'data-story',
    palettes: ['paper-light', 'dark-tech'],
    fonts: ['inter-bold', 'space-inter'],
    motion: 2,
    accentUsage: 0.6,
  },
  'neon-mono': {
    id: 'neon-mono',
    palettes: ['neon-noir', 'mono-accent'],
    fonts: ['mono-tech', 'inter-bold'],
    motion: 3,
    accentUsage: 0.9,
  },
};

/** 9:16 / 16:9 / 1:1 canvases. Platform UI safe area included. */
export type CanvasSpec = {
  width: number;
  height: number;
  fps: number;
  /** fraction of height reserved at top (platform chrome) */
  safeTop: number;
  safeBottom: number;
  sideMargin: number;
};

export const canvases: Record<string, CanvasSpec> = {
  '9:16': { width: 1080, height: 1920, fps: 30, safeTop: 0.12, safeBottom: 0.18, sideMargin: 72 },
  '16:9': { width: 1920, height: 1080, fps: 30, safeTop: 0.05, safeBottom: 0.08, sideMargin: 120 },
  '1:1': { width: 1080, height: 1080, fps: 30, safeTop: 0.08, safeBottom: 0.1, sideMargin: 72 },
};

export function resolveBrand(seed: number, familyId?: string) {
  const familyIds = Object.keys(templateFamilies);
  const family =
    templateFamilies[familyId ?? familyIds[seed % familyIds.length]!] ??
    templateFamilies['kinetic-doc']!;
  const palette = palettes[family.palettes[seed % family.palettes.length]!]!;
  const fonts = fontPairs[family.fonts[seed % family.fonts.length]!]!;
  return { family, palette, fonts };
}
