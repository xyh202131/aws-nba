import { unlink } from "node:fs/promises";

// Historical Agent fixtures stay local; the public release ships only the
// user-supplied finished film. This allowlist cannot affect other build assets.
const retired = [
  "amen.mp4", "amen-0.webp", "amen-1.webp", "amen-2.webp",
  "flagg.mp4", "flagg-0.webp", "flagg-1.webp", "flagg-2.webp",
];
for (const name of retired) {
  try {
    await unlink(new URL(`../dist/media/${name}`, import.meta.url));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
console.log("Public release excludes the 8 retired sample assets.");
