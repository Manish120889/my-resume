// One-shot: convert the 14 loka PNGs' black backgrounds to true alpha.
// alpha = max(r,g,b) combined with any existing alpha; rgb unpremultiplied.
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "public", "media");
const slugs = ["satyaloka","tapoloka","janaloka","maharloka","svarloka","bhuvarloka","bhurloka","atala","vitala","sutala","talatala","mahatala","rasatala","patala"];

for (const slug of slugs) {
  const file = join(dir, `${slug}.png`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = Math.max(r, g, b);
    const a = Math.min(data[i + 3], luma);
    if (a > 0 && a < 255) {
      const k = 255 / a;
      data[i] = Math.min(255, Math.round(r * k));
      data[i + 1] = Math.min(255, Math.round(g * k));
      data[i + 2] = Math.min(255, Math.round(b * k));
    }
    data[i + 3] = a;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(file + ".tmp");
  const { rename } = await import("node:fs/promises");
  await rename(file + ".tmp", file);
  console.log(`${slug}: ${info.width}x${info.height} done`);
}
