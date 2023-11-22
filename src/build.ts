import * as fs from "fs/promises";
import * as path from "path";

import ncc from "@vercel/ncc";

import { getDirname } from "./helpers.js";

const __dirname = getDirname(import.meta);
const distDir = path.resolve(__dirname, "../dist");
const licensesDir = path.resolve(distDir, "licenses");
const actionsDir = path.resolve(__dirname, "./actions");

/**
 * Compiles the specified file into a distributable action.
 * @param file The name of the TypeScript file to be compiled.
 * @returns A promise that resolves when the file has been compiled.
 */
async function compile(file: string): Promise<void> {
  const filePath = path.join(actionsDir, file);
  const actionName = path.basename(file, ".ts");
  const licenseFile = `${actionName}.txt`;

  const { code, assets = {} } = await ncc(filePath, {
    minify: true,
    license: licenseFile,
  });

  const { source: license } = assets[licenseFile];

  await Promise.all([
    fs.writeFile(path.resolve(distDir, `${actionName}.js`), code),
    fs.writeFile(path.resolve(licensesDir, licenseFile), license),
  ]);
}

await fs.rm(distDir, { recursive: true, force: true }).catch(() => {});
await fs.mkdir(licensesDir, { recursive: true });

const files = await fs
  .readdir(actionsDir)
  .then((files) => files.filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts")));

await Promise.all(files.map(compile));

await fs.writeFile(path.resolve(distDir, "package.json"), '{"type":"module"}');
