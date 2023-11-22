import path from "path";
import { fileURLToPath } from "url";

import * as core from "@actions/core";
import * as exec from "@actions/exec";

export interface CleanupTask {
  name: string;
  task: () => Promise<void>;
}

/**
 * Creates a new array to store named cleanup tasks.
 * @returns An empty array of cleanup tasks.
 */
export function newCleanupTasksStore(): CleanupTask[] {
  return [];
}

/**
 * Executes the given function with the given cleanup tasks and handles any
 * thrown errors.
 * @param run The function to be executed.
 */
export async function runWithHandling(run: () => Promise<CleanupTask[]>): Promise<void> {
  try {
    const cleanupTasks = await run();
    await core.group("Cleaning up...", () =>
      Promise.all(
        cleanupTasks.map(({ name, task }) => {
          try {
            return task();
          } catch (error) {
            const message = `Cleanup task "${name}" failed`;
            if (error instanceof Error) {
              core.info(`${message}: ${error.message}`);
            } else {
              core.info(`${message}: ${JSON.stringify(error)}`);
            }
          }
        }),
      ),
    );
  } catch (error) {
    if (error instanceof Error) core.setFailed(error);
    else core.setFailed(JSON.stringify(error));
  }
}

/**
 * Parses the given flags string and returns an array of individual flags.
 * @param flags The string containing the flags to be parsed.
 * @returns An array of individual flags parsed from the flags string.
 */
export function parseCommandFlags(flags: string): string[] {
  flags = flags.trim();
  if (flags === "") {
    return [];
  }
  return flags.split(/\s+/);
}

/**
 * Checks if command exists.
 * @param command Command to check.
 * @returns Boolean indicating whether the command exists.
 */
export async function isCommandExists(command: string): Promise<boolean> {
  let exitCode = 0;
  try {
    if (process.platform === "win32") {
      await exec.exec("where", [command]);
    } else {
      await exec.exec("which", [command]);
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "number") {
      exitCode = error.code;
    }
  }

  return exitCode === 0;
}

/**
 * Alternative to `__dirname` for ESM.
 * @param importMeta `import.meta` object.
 * @returns Directory name.
 */
export function getDirname(importMeta: ImportMeta): string {
  return path.dirname(fileURLToPath(importMeta.url));
}
