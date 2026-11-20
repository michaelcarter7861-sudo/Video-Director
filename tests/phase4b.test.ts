/**
 * Phase 4 remainder: priors/ingest, hook A/B, OpenFilm export.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateDirector } from "../src/schema/director.js";
import { deriveVisualPayloads, buildProject } from "../src/pipeline/plan.js";
import {
  DEFAULT_PRIORS,
  parseMetricsCsv,
  foldPriors,
  expectedRetention,
  rankHooks,
  savePriors,
  loadPriors,
} from "../src/pipeline/priors.js";
import { planHooks, applyHook } from "../src/pipeline/hooks.js";
import { buildOpenFilmProject } from "../src/pipeline/openfilm.js";
import { dummy } from "../src/pipeline/tts.js";

const load = (p: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

function specOf(file: string) {
  const parsed = validateDirector(load(file));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid spec");
  return parsed.spec;
}

async function silentBuild(spec: ReturnType<typeof specOf>, dir: string) {
  const silent = deriveVisualPayloads(spec);
  silent.beats = silent.beats.map((b) => ({
    ...b,
    vo: "",
    minSec: 1.1,
    maxSec: Math.max(b.maxSec, 1.1),
  }));
  return buildProject(silent, { projectDir: dir, voice: "dummy" });
}

test("buildProject accepts one WAV per beat and measures external voice audio", async () => {
  const spec = specOf("examples/demo/director.json");
  spec.beats = [structuredClone(spec.beats[0]!)];
  spec.beats[0]!.vo = "A real voice line from a file.";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vd-external-voice-"));
  const voiceDir = path.join(root, "voice");
  const projectDir = path.join(root, "project");
  fs.mkdirSync(voiceDir, { recursive: true });
  const external = path.join(voiceDir, `${spec.beats[0]!.id}.wav`);
  const written = dummy({
    text: spec.beats[0]!.vo,
    outWav: external,
    voice: "dummy",
    speed: 1,
    lang: "en",
  });

  const built = await buildProject(spec, {
    projectDir,
    voice: "dummy",
    voiceFilesDir: voiceDir,
  });
  assert.ok(built.report.beats[0]!.measuredMs > 0);
  assert.ok(
    Math.abs(built.report.beats[0]!.measuredMs - written.durationMs) < 100,
  );
  assert.ok(built.report.warnings.some((w) => w.includes("external-file")));
  assert.ok(fs.existsSync(built.audioPath));
  assert.equal(
    built.renderInput.beats[0]!.words.map((w) => w.word).join(" "),
    spec.beats[0]!.vo,
  );
});

test("metrics CSV parsing requires the real headers and skips junk rows", () => {
  const rows = parseMetricsCsv(
    [
      "id,views,avg_view_sec,duration_sec,retention_3s,formula",
      "a,1000,12,30,0.6,interrupt",
      "b,notanumber,12,30,,curiosity",
      "c,500,15,30,,contrarian",
    ].join("\n"),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.formula, "interrupt");
  assert.equal(rows[1]!.id, "c");

  assert.deepEqual(
    parseMetricsCsv("id,views\nx,1"),
    [],
    "missing columns => no rows",
  );
});

test("folding is views-weighted, not row-counted", () => {
  const rows = parseMetricsCsv(
    [
      "id,views,avg_view_sec,duration_sec,retention_3s,formula",
      "big,100000,18,30,0.8,interrupt",
      "small,100,3,30,0.1,contrarian",
    ].join("\n"),
  );
  const priors = foldPriors(DEFAULT_PRIORS, rows, () => undefined);
  const interrupt = priors.measured.find((m) => m.formula === "interrupt")!;
  assert.equal(interrupt.retention3s, 0.8);
  assert.ok(interrupt.rows === 100000);
});

test("small samples are shrunk toward the seed, so ranking cannot be hijacked", () => {
  const one = foldPriors(
    DEFAULT_PRIORS,
    parseMetricsCsv(
      "id,views,avg_view_sec,duration_sec,retention_3s,formula\nx,500,30,30,1,number",
    ),
    () => undefined,
  );
  const shrunk = expectedRetention(one, "number");
  const seed = DEFAULT_PRIORS.seed.number!;
  // one observation must not drag the estimate all the way to 1.0
  assert.ok(shrunk.retention3s > seed.retention3s);
  assert.ok(shrunk.retention3s < 0.75, `got ${shrunk.retention3s}`);
  assert.equal(shrunk.source, "blended");

  // with plenty of evidence the measured value should win
  const many = {
    ...DEFAULT_PRIORS,
    measured: [
      {
        formula: "number",
        n: 40,
        retention3s: 0.9,
        completion: 0.5,
        rows: 1,
        updatedAt: "",
      },
    ],
  };
  assert.equal(expectedRetention(many, "number").source, "measured");
  assert.ok(expectedRetention(many, "number").retention3s > 0.85);
});

test("priors round-trip through disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-priors-"));
  const file = savePriors(DEFAULT_PRIORS, dir);
  assert.ok(fs.existsSync(file));
  const back = loadPriors(dir);
  assert.equal(back.version, 1);
  assert.ok(Object.keys(back.seed).length >= 6);
  assert.deepEqual(loadPriors(path.join(dir, "nope")), DEFAULT_PRIORS);
});

test("rankHooks orders by expected retention and survives unknown formulas", () => {
  const ranked = rankHooks(DEFAULT_PRIORS, [
    { formula: "empathy", text: "a" },
    { formula: "interrupt", text: "b" },
    { formula: "made-up", text: "c" },
  ]);
  assert.equal(ranked[0]!.formula, "interrupt");
  assert.equal(ranked.length, 3);
  assert.ok(ranked.every((r) => Number.isFinite(r.expected)));
});

test("hook A/B holds the body constant and only rewrites the opening beat", async () => {
  const spec = specOf("examples/demo/director.json");
  const plans = planHooks(spec, DEFAULT_PRIORS, 3);
  assert.equal(plans.length, 3);
  assert.equal(new Set(plans.map((p) => p.formula)).size > 1, true);

  const [a, b] = plans;
  const va = applyHook(spec, a!);
  const vb = applyHook(spec, b!);
  assert.notEqual(va.id, vb.id);
  assert.notEqual(va.beats[0]!.vo, vb.beats[0]!.vo);
  assert.equal(va.beats[0]!.onScreen.split(/\s+/).length <= 5, true);
  // every beat after the hook is byte-identical across slots
  assert.deepEqual(va.beats.slice(1), vb.beats.slice(1));
  assert.equal(validateDirector(va).ok, true);
});

test("OpenFilm export produces a valid film with one page per beat", async () => {
  const spec = specOf("examples/demo/director.json");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-openfilm-"));
  const built = await silentBuild(spec, dir);
  const out = path.join(dir, "film");
  const result = buildOpenFilmProject(spec, built.renderInput, out);

  const film = fs.readFileSync(result.filmHtml, "utf8");
  assert.equal(result.pages.length, built.renderInput.beats.length);
  assert.equal(
    (film.match(/<iframe /g) ?? []).length,
    built.renderInput.beats.length,
  );
  // OpenFilm's validator rejects percentages and width/height attributes
  assert.equal(
    /%/.test(
      film
        .replace(/\s+/g, " ")
        .match(/style="[^"]*"/g)
        ?.join("") ?? "",
    ),
    false,
  );
  assert.equal((film.match(/ (width|height)="/g) ?? []).length, 0);
  // every clip points at a file that exists
  for (const m of film.matchAll(/src="([^"#]+)/g)) {
    assert.ok(fs.existsSync(path.join(out, m[1]!)), `missing ${m[1]}`);
  }
  // every page declares the one contract OpenFilm relies on
  for (const page of result.pages) {
    const html = fs.readFileSync(path.join(out, page), "utf8");
    assert.match(html, /window\.film\s*=/);
    assert.match(html, /frame\(t\)/);
    assert.doesNotMatch(
      html,
      /requestAnimationFrame|setInterval/,
      "pages must not animate themselves",
    );
  }
  assert.ok(result.seconds > 0);
});

test("dashboard renders every project, flags failures, and folds metrics in", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-dash-"));
  const out = path.join(dir, "dash", "dashboard.html");
  const { writeDashboard } = await import("../src/pipeline/review.js");
  writeDashboard(
    [
      {
        id: "a",
        aspect: "9:16",
        seconds: 28.1,
        qaPass: true,
        failedGates: [],
        criticVerdict: "ship",
        issues: 0,
        title: "T one",
        hasVideo: true,
        hasReview: true,
        metrics: { views: 1200, retention3s: 0.62 },
      },
      {
        id: "b",
        aspect: "16:9",
        seconds: 36.6,
        qaPass: false,
        failedGates: ["no featureless segments > 0.4s"],
        criticVerdict: "patch",
        issues: 2,
        title: "T two",
        hasVideo: true,
        hasReview: false,
        metrics: { views: 40, retention3s: 0.2 },
      },
    ],
    out,
  );
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /2 project\(s\)/);
  assert.match(html, /1 QA pass/);
  assert.match(html, /no featureless segments/);
  assert.match(html, /1,200/, "views are formatted");
  assert.match(html, /62%/);
  assert.match(html, /href="\.\.\/a\/review\.html"/);
  assert.match(html, /no review/);
  assert.doesNotMatch(html, /https?:\/\/(?!.*wd)/, "no remote assets");
});

test("GitHub Actions video artifacts include MP4 files only", () => {
  for (const file of [
    ".github/workflows/render.yml",
    ".github/workflows/publish-batch.yml",
  ]) {
    const workflow = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.match(
      workflow,
      /path: artifact\/videos\/\*\.mp4/,
      `${file} uploads flattened MP4s only`,
    );
    assert.match(
      workflow,
      /find out -type f -name 'video\.mp4'/,
      `${file} stages rendered videos`,
    );
    const upload =
      workflow
        .split(/uses: actions\/upload-artifact@v4/)[1]
        ?.split(/\n\s{6}- name:/)[0] ?? "";
    assert.match(upload, /path: artifact\/videos\/\*\.mp4/);
    assert.doesNotMatch(upload, /\.html|\.json|\.ts|dashboard|review/i);
  }
  const batch = fs.readFileSync(
    path.join(process.cwd(), ".github/workflows/publish-batch.yml"),
    "utf8",
  );
  assert.match(
    batch,
    /variants --spec .*--render/,
    "batch variants must render full videos",
  );
});
