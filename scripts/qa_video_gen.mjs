/* Generate a synthetic race video: 6 laps x 36 s, 2 fps, 320x180.
   Luma ramps brighter through each lap and snaps dark at the crossing —
   exactly the global-luma flash signature the extractor detects. */
import { deflateSync } from "node:zlib";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const W = 320, H = 180, FPS = 2, LAP = 36, LAPS = 6;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function grayPng(v) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(W, v)]);
  const raw = Buffer.concat(Array(H).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const unique = new Map();
const frames = [];
for (let lap = 0; lap < LAPS; lap++) {
  const n = LAP * FPS;
  for (let s = 0; s < n; s++) {
    const frac = s / n;
    let v = Math.round(40 + frac * 100);
    if (s < 2) v = 10; // crossing flash: two dark frames
    frames.push(v);
  }
}
for (const v of new Set(frames)) if (!unique.has(v)) unique.set(v, grayPng(v));
const dir = "_race_frames";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
frames.forEach((v, i) => writeFileSync(`${dir}/f${String(i).padStart(4, "0")}.png`, unique.get(v)));
console.log("frames:", frames.length, "unique:", unique.size);

// pngs → webm via playwright ffmpeg (image2pipe → libvpx)
const ff = "C:/Users/Sir/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe";
// only image2pipe demuxing is compiled in — feed PNGs over stdin
import { spawn } from "node:child_process";
const args = [
  "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libvpx", "-b:v", "100k", "_synth_race.webm",
];
const proc = spawn(ff, args);
proc.stderr.on("data", (d) => process.stderr.write(d));
for (const v of frames) {
  if (!proc.stdin.write(unique.get(v))) await new Promise((r) => proc.stdin.once("drain", r));
}
proc.stdin.end();
await new Promise((r) => proc.on("close", r));
console.log("wrote _synth_race.webm");
