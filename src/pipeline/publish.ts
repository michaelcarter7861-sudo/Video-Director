/**
 * Publish pack: everything a human (or the upload API later) needs, generated from the spec.
 * Also writes the license manifest — a video without one is not publishable.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Director } from '../schema/director.js';
import type { TimingReport } from '../engine/types.js';

export type LicenseEntry = {
  asset: string;
  kind: 'font' | 'audio' | 'code' | 'image' | 'video' | 'music';
  source: string;
  license: string;
  attribution: string;
};

export type PublishPack = {
  id: string;
  titleVariants: string[];
  description: string;
  tags: string[];
  hashtags: string[];
  disclosure: { syntheticVoice: boolean; aiGeneratedVisuals: boolean };
  srt: string;
  thumbnailFrame: number;
  licenses: LicenseEntry[];
};

export function buildPublishPack(
  spec: Director,
  timing: TimingReport,
  words: { id: string; words: { word: string; startMs: number; endMs: number }[] }[],
): PublishPack {
  const hook = spec.hooks[0]?.text ?? spec.thesis;
  const titles = [
    trim(spec.thesis, 92),
    trim(`${hook} — ${spec.thesis.split(/[.!?]/)[0]}`, 92),
    trim(spec.beats.find((b) => b.role === 'loop')?.vo ?? spec.thesis, 92),
  ].filter((t, i, arr) => t.length > 8 && arr.indexOf(t) === i);

  const description = [
    spec.thesis,
    '',
    'What is in this video:',
    ...spec.beats.filter((b) => b.role !== 'cta').map((b, i) => `${i + 1}. ${b.onScreen || b.vo}`),
    '',
    `Angle: ${spec.angle} · Audience: ${spec.audience}`,
    spec.originality.uniqueInput ? `Based on: ${spec.originality.uniqueInput}` : '',
    spec.originality.dataRefs.length ? `Data: ${spec.originality.dataRefs.join(', ')}` : '',
    '',
    `Voice: synthetic (${spec.audio.voice}). Visuals: programmatically rendered.`,
    '#shorts #buildinpublic',
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const tags = unique([
    ...spec.publish.tags,
    ...keywordise(spec.thesis),
    ...keywordise(spec.hooks.map((h) => h.text).join(' ')),
  ]).slice(0, 15);

  const flat = words.flatMap((b) => b.words.map((w) => ({ ...w, beat: b.id })));
  return {
    id: spec.id,
    titleVariants: titles.length ? titles : [spec.id],
    description,
    tags,
    hashtags: tags.slice(0, 5).map((t) => `#${t.replace(/[^a-z0-9]/gi, '')}`),
    disclosure: spec.publish.disclosure,
    srt: buildSrt(flat),
    thumbnailFrame: 0,
    licenses: [
      ...FONT_LICENSES,
      {
        asset: 'voiceover',
        kind: 'audio',
        source: `tts:${spec.audio.voice}`,
        license: 'model-dependent (Kokoro-82M = Apache-2.0)',
        attribution: 'Synthetic voice generated locally',
      },
      {
        asset: 'renderer',
        kind: 'code',
        source: 'video-director (this repo) / @napi-rs/canvas / ffmpeg (LGPL build)',
        license: 'MIT / MIT / LGPL-2.1+',
        attribution: 'Programmatic rendering — no stock footage used',
      },
    ],
  };
}

const FONT_LICENSES: LicenseEntry[] = [
  { asset: 'Inter', kind: 'font', source: 'npm @fontsource/inter', license: 'OFL-1.1', attribution: 'Rasmus Andersson' },
  { asset: 'Space Grotesk', kind: 'font', source: 'npm @fontsource/space-grotesk', license: 'OFL-1.1', attribution: 'Florian Karsten' },
  { asset: 'JetBrains Mono', kind: 'font', source: 'npm @fontsource/jetbrains-mono', license: 'OFL-1.1', attribution: 'JetBrains' },
];

export function buildSrt(words: { word: string; startMs: number; endMs: number }[]): string {
  const lines: string[] = [];
  const chunkSize = 6;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const start = chunk[0]!.startMs;
    const end = chunk[chunk.length - 1]!.endMs;
    lines.push(
      `${lines.length / 4 + 1}`,
      `${ts(start)} --> ${ts(end)}`,
      chunk.map((w) => w.word).join(' '),
      '',
    );
  }
  return lines.join('\n');
}

function ts(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRest = Math.floor(ms % 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(msRest).padStart(3, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function writePublishPack(pack: PublishPack, projectDir: string): void {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'publish.json'), JSON.stringify({ ...pack, srt: undefined }, null, 2));
  fs.writeFileSync(path.join(projectDir, 'captions.srt'), pack.srt);
  fs.writeFileSync(path.join(projectDir, 'manifest.json'), JSON.stringify({ id: pack.id, licenses: pack.licenses }, null, 2));
}

function keywordise(text: string): string[] {
  const stop = new Set(['the', 'and', 'your', 'you', 'for', 'with', 'that', 'this', 'are', 'from', 'not', 'but', 'why', 'how', 'what', 'when', 'they', 'them', 'their', 'was', 'were', 'has', 'have', 'been', 'will', 'does', 'did', 'into', 'than', 'then', 'just', 'like', 'about', 'over', 'more', 'most', 'some', 'such', 'only', 'also', 'very']);
  return unique(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stop.has(w)),
  );
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function trim(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
