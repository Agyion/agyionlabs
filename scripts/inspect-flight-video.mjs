/** CPU-only sequential video frames for a human flight review; never opens a browser. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve(process.argv[2] || 'artifacts/verification/single-flight-final');
const report = JSON.parse(await readFile(path.join(directory, 'verification.json'), 'utf8'));
if (!report.video || !report.recording?.launchAt) throw new Error('This recording needs current flight timing metadata.');
const output = path.join(directory, 'sequential-frames');
await mkdir(output, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error}`);
  return result.stdout;
};
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', report.video]));
const duration = Number(probe.format.duration);
if (!Number.isFinite(duration) || duration <= 0) throw new Error('No readable video duration.');
// Playwright starts recording at the first captured page frame. Its exact first
// wall-clock timestamp is unavailable; infer it from the final frame and review
// broad windows, including the neighboring frames, rather than a single image.
const inferredStartAt = report.recording.stopRequestedAt - duration * 1000;
const at = wallClock => (wallClock - inferredStartAt) / 1000;
const readyAt = report.recording.readyObservedAt;
const windows = [
  { name: '00-launch', start: at(report.recording.launchAt) - 1, length: 3.2 },
  { name: '01-former-midpoint', start: at(report.recording.launchAt + 3600) - 1.6, length: 3.2 },
  { name: '02-journey-midpoint', start: at(report.recording.launchAt + 4900) - 1.6, length: 3.2 },
  { name: '03-navigation', start: at(report.recording.navigationAt) - 1.6, length: 3.2 },
  { name: '04-ready-reveal', start: at(readyAt) - 1.6, length: 3.2 },
];
const width = report.mobile ? 260 : 480;
const frames = [];
for (const window of windows) {
  if (!Number.isFinite(window.start)) continue;
  const start = Math.max(0, window.start);
  const length = Math.min(window.length, duration - start);
  if (length <= 0) continue;
  const count = Math.floor(length * 5);
  const rows = Math.ceil(count / 4);
  const file = path.join(output, `${window.name}.png`);
  // Five frames per second gives 16 consecutive frames per 3.2s contact sheet.
  const filter = `fps=5,scale=${width}:-1,drawtext=text='%{pts\\:hms}':fontsize=16:fontcolor=white:x=8:y=8:box=1:boxcolor=black@0.7,tile=4x${rows}:padding=4:margin=4`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', report.video,
    '-vf', filter, '-frames:v', '1', '-update', '1', file]);
  frames.push({ name: window.name, file, videoStartSeconds: start, lengthSeconds: length, sampledFrames: count });
}
const index = {
  video: report.video, durationSeconds: duration, inferredStartAt,
  timingNote: 'Video windows use an inferred wall-clock alignment. The full video and neighboring frames remain the source for visual review; phase/timing assertions alone do not establish continuous motion.',
  launchAt: report.recording.launchAt, navigationAt: report.recording.navigationAt, readyObservedAt: readyAt,
  frames,
};
await writeFile(path.join(output, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify(index));
