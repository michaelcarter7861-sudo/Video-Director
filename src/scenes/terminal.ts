/**
 * Terminal — shell prompt with lines appearing in sequence, then a success state.
 */
import { drawBackground, drawCheck, hexToRgba, roundRect, withAlpha } from '../engine/draw.js';
import { clamp, easeOutCubic, progress } from '../lib/easing.js';
import type { Env } from '../engine/types.js';

export function terminal(env: Env): void {
  const { ctx, width: w, height: h, palette: p, fonts, beat, f, dur } = env;
  drawBackground(ctx, w, h, p, { vignette: env.spec.style.vignette, altTint: 0.6, grid: false });

  const lines = beat.visual.lines ?? [`$ ${beat.onScreen || 'run'}`, '✓ done'];
  const panelW = w - env.canvas.sideMargin * 2;
  const longest = Math.max(...lines.map((l) => l.replace(/^\$\s*/, '').length + 2), 1);
  // 0.62em per mono char: shrink until the longest command fits the panel
  const size = Math.max(16, Math.min(Math.round(w * 0.032), Math.floor((panelW - 60) / (longest * 0.62))));
  const lineH = size * 1.9;
  const panel = {
    x: env.canvas.sideMargin,
    y: h * 0.30,
    w: panelW,
    h: Math.min(h * 0.42, 120 + lines.length * lineH),
  };

  withAlpha(ctx, easeOutCubic(progress(f, 8)), () => {
    ctx.fillStyle = hexToRgba(p.bgAlt, 0.96);
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(p.grid ?? p.fgMuted, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = hexToRgba(p.fgMuted, 0.75);
    ctx.font = `500 ${Math.round(size * 0.62)}px "${fonts.mono.family}"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('zsh — video-director', panel.x + 22, panel.y + 22);
  });

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const perLine = Math.max(4, (dur * 0.55) / lines.length);

  lines.forEach((line, i) => {
    const appear = progress(f, 1, i * perLine);
    if (appear <= 0) return;
    const typed = clamp(progress(f, perLine * 0.8, i * perLine));
    const visible = line.slice(0, Math.ceil(line.length * typed));
    const y = panel.y + 60 + i * lineH;
    const isCommand = line.trimStart().startsWith('$');
    const isSuccess = /^[✓✔]/.test(line.trim());

    ctx.font = `${isCommand ? 500 : 400} ${size}px "${fonts.mono.family}"`;

    if (isCommand) {
      const prompt = '$ ';
      ctx.fillStyle = p.accent;
      ctx.fillText(prompt, panel.x + 24, y);
      const promptW = ctx.measureText(prompt).width;
      ctx.fillStyle = p.fg;
      ctx.fillText(visible.replace(/^\$\s*/, ''), panel.x + 24 + promptW, y);
    } else if (isSuccess) {
      // strip the unicode tick (no glyph in the OFL subsets) and draw it instead
      const label = visible.replace(/^[✓✔]\s*/, '');
      drawCheck(ctx, panel.x + 24, y + size * 0.15, size * 0.8, p.accentAlt, Math.max(3, size * 0.14));
      ctx.fillStyle = p.accentAlt;
      ctx.fillText(label, panel.x + 24 + size * 1.3, y);
    } else {
      ctx.fillStyle = hexToRgba(p.fg, 0.82);
      ctx.fillText(visible, panel.x + 24, y);
    }
  });

  // cursor
  const cursorVisible = Math.floor(f / 8) % 2 === 0;
  if (cursorVisible) {
    const lastTyped = Math.min(lines.length - 1, Math.floor(progress(f, dur * 0.55) * lines.length));
    ctx.fillStyle = p.accent;
    ctx.fillRect(panel.x + 24, panel.y + 60 + lastTyped * lineH + size + 4, size * 0.55, 3);
  }

  if (beat.onScreen) {
    ctx.fillStyle = p.fg;
    ctx.font = `${fonts.display.weight} ${Math.round(w * 0.05)}px "${fonts.display.family}"`;
    ctx.textAlign = 'left';
    ctx.fillText(beat.onScreen, env.canvas.sideMargin, h * 0.22);
  }
}
