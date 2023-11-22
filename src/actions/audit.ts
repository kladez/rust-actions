import fs from "fs/promises";

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Octokit } from "@octokit/rest";
import type { PullRequestEvent } from "@octokit/webhooks-types";

import { config } from "../config.js";
import { newCleanupTasksStore, type CleanupTask, runWithHandling } from "../helpers.js";

interface Audit {
  database: {
    "advisory-count": number;
    "last-commit": string;
    "last-updated": string;
  };
  lockfile: {
    "dependency-count": number;
  };
  settings: {
    // target_arch: null;
    // target_os: null;
    // severity: null;
    // ignore: [];
    informational_warnings: string[];
  };
  vulnerabilities: {
    found: true;
    count: number;
    list: {
      advisory: {
        id: string;
        package: string;
        title: string;
        description: string;
        date: string;
        aliases: string[];
        // related: [];
        collection: string;
        categories: string[];
        keywords: string[];
        cvss: string;
        // informational: null;
        references: string[];
        // source: null;
        url: string;
        // withdrawn: null;
        license: string;
      };
      // versions: {
      //   patched: [];
      //   unaffected: [];
      // };
      // affected: null;
      package: {
        name: string;
        version: string;
        source: string;
        checksum: string;
        dependencies: {
          name: string;
          version: string;
          source: string;
        }[];
        // replace: null;
      };
    }[];
  };
  // warnings: {};
}

interface Manifest {
  name: string;
}

interface Metadata {
  packages: MetadataDependency[];
}

interface MetadataDependency {
  name: string;
  dependencies: MetadataDependency[];
}

interface ParentsTree {
  name: string;
  parents?: ParentsTree[];
}

/**
 * Retrieves the manifest by executing the `cargo read-manifest` command and parsing the output.
 * @returns A promise that resolves to the parsed manifest.
 */
async function getManifest(): Promise<Manifest> {
  let { stdout } = await exec.getExecOutput("cargo", ["read-manifest"], { silent: !config.isDebug });
  return JSON.parse(stdout) as Manifest;
}

/**
 * Returns the contents of the `Cargo.toml` file as a string.
 * @returns The contents of the `Cargo.toml` file.
 */
async function getTomlManifest(): Promise<string> {
  return await fs.readFile("Cargo.toml", "utf8").then((f) => f.toString());
}

/**
 * Retrieves the metadata using the `cargo metadata` command and returns it as a JSON object.
 * @returns A promise that resolves to the metadata object.
 */
async function getMetadata(): Promise<Metadata> {
  await exec.exec("cargo", ["fetch"], { silent: !config.isDebug });
  const { stdout } = await exec.getExecOutput("cargo", ["metadata", "--offline", "--format-version=1"], {
    silent: !config.isDebug,
  });
  return JSON.parse(stdout) as Metadata;
}

/**
 * Retrieves the audit information.
 * @returns The audit information.
 */
async function getAudit(): Promise<Audit> {
  const { stdout } = await exec.getExecOutput("cargo", ["audit", "--json"], {
    ignoreReturnCode: true,
    silent: !config.isDebug,
  });
  return JSON.parse(stdout) as Audit;
}

/**
 * Retrieves all chains from the parent tree.
 * @param parentsTree The tree of parent dependencies from which to start retrieving chains.
 * @param path The path traversal up to the current dependency. Defaults to an empty array.
 * @returns An array of arrays representing the chains.
 */
function getChainsFromParentTree(parentsTree: ParentsTree, path: string[] = []): string[][] {
  if (!parentsTree.parents || parentsTree.parents.length === 0) {
    return [[...path, parentsTree.name]];
  }

  return parentsTree.parents.flatMap((parent) => getChainsFromParentTree(parent, [...path, parentsTree.name]));
}

/**
 * Filters longer tangled chains and returns the shortest chains for each unique end dependency.
 * @param chains An array of chains represented as arrays of strings with the same start subdependency.
 * @returns An array of the shortest chains for each unique start and end point.
 */
function filterVerboseChains(chains: string[][]): string[][] {
  const chainMap = new Map<string, string[]>();

  chains.forEach((chain) => {
    const end = chain[chain.length - 1];
    if (!chainMap.has(end) || chain.length < chainMap.get(end)!.length) {
      chainMap.set(end, chain);
    }
  });

  return Array.from(chainMap.values());
}

/**
 * Generates a tree of parent dependencies for a given dependency name.
 * @param name The name of the dependency.
 * @param dependencies An array of objects representing all the dependencies.
 * @param visited A set of dependency names that have already been visited (default is an empty set).
 * @returns An object representing the tree of parent dependencies.
 */
function getParentsTree(
  name: string,
  dependencies: MetadataDependency[],
  visited: Set<string> = new Set(),
): ParentsTree {
  return {
    name,
    parents: dependencies
      .filter((pkg) => pkg.dependencies.some((dep) => dep.name === name) && !visited.has(pkg.name))
      .map((pkg) => getParentsTree(pkg.name, dependencies, new Set(visited).add(pkg.name))),
  };
}

/**
 * Finds the line number of a Cargo manifest line that declares a given crate.
 * @param manifest The contents of the Cargo manifest.
 * @param target The crate to search for in the manifest.
 * @returns The line number of the matching manifest line, or undefined if not found.
 */
function getManifestLineByDependency(manifest: string, target: string): number | undefined {
  const regExps = {
    dependenciesBlock: new RegExp(`^\\s*\\[("?)((build|dev)[-_])?dependencies\\1(\\.("?)${target}\\5)?\\]`),
    anyBlock: /^\s*\[/,
    target: new RegExp(`^\\s*(\\[("?)((build|dev)[-_])?dependencies\\2\\.("?)${target}\\5\\]|("?)${target}\\6)`),
    rootTarget: new RegExp(
      `^\\s*("?)((build|dev)[-_])?dependencies\\1\\s*=\\s*("?){(\\s*("?).+\\6\\s*=\\s*(".+?"|{.+?}),)*\\s*("?)${target}\\8\\s*=`,
    ),
  };

  let inDependenciesBlock = false;
  let inRoot = true;
  for (const [index, line] of manifest.split("\n").entries()) {
    if (regExps.dependenciesBlock.test(line)) {
      inRoot = false;
      inDependenciesBlock = true;
    } else if (regExps.anyBlock.test(line)) {
      inRoot = false;
      inDependenciesBlock = false;
    }
    if ((inDependenciesBlock && regExps.target.test(line)) || (inRoot && regExps.rootTarget.test(line))) {
      return index + 1;
    }
  }
}

/**
 * Adds review comments to an audit.
 * @param audit The audit object.
 * @returns A promise that resolves when the review comments are added.
 */
async function reviewPr(audit: Audit): Promise<void> {
  core.info("Adding review comments...");
  const octokit = new Octokit({
    auth: config.context.token,
  });

  const reviewOptions: Parameters<typeof octokit.pulls.createReview>[0] = {
    owner: config.context.owner,
    repo: config.context.repository,
    pull_number: (config.context.event as PullRequestEvent).pull_request.number,
  };

  if (audit.vulnerabilities.found) {
    const { name: packageName } = await getManifest();
    const { packages: dependencies } = await getMetadata();

    const subdependencyToChainsMap = new Map<string, string[][]>();
    const vulnerableDependenciesMap = audit.vulnerabilities.list.reduce(
      (result, vulnerability) => {
        let dependencyToChainsMap = new Map<string, string[]>();
        if (subdependencyToChainsMap.has(vulnerability.package.name)) {
          subdependencyToChainsMap
            .get(vulnerability.package.name)!
            .filter((chain) => chain[0] === vulnerability.package.name)
            .forEach((chain) => {
              dependencyToChainsMap.set(chain[chain.length - 1], chain);
            });
        } else {
          const parentsTree = getParentsTree(vulnerability.package.name, dependencies);
          const verboseChains = getChainsFromParentTree(parentsTree)
            .filter((chain) => chain[chain.length - 1] === packageName)
            .map((chain) => chain.slice(0, -1));
          const chains = filterVerboseChains(verboseChains);
          chains.forEach((chain) => {
            dependencyToChainsMap.set(chain[chain.length - 1], chain);
          });
          subdependencyToChainsMap.set(vulnerability.package.name, chains);
        }

        dependencyToChainsMap.forEach((chain, dependency) => {
          if (!result.has(dependency)) {
            result.set(dependency, []);
          }
          result.get(dependency)!.push({
            advisory: vulnerability.advisory,
            chain,
          });
        });

        return result;
      },
      new Map<
        string,
        {
          advisory: Audit["vulnerabilities"]["list"][0]["advisory"];
          chain: string[];
        }[]
      >(),
    );

    reviewOptions.event = "REQUEST_CHANGES";

    /**
     * Body will have the following format:
     * ```md
     * # Found Vulnerability Report(s?)
     *
     * - `dependency 1`: [advisory id 1](https://rustsec.org/advisories/[advisory id 1])
     * - `dependency`
     *   - [advisory id 2](https://rustsec.org/advisories/[advisory id 2])
     *   - [advisory id 3](https://rustsec.org/advisories/[advisory id 3])
     * ```
     */
    reviewOptions.body =
      `# Found Vulnerability Report` + (Object.values(vulnerableDependenciesMap).flat().length > 1 ? "s" : "") + `\n\n`;
    vulnerableDependenciesMap.forEach((vulnerabilities, dependency) => {
      if (vulnerabilities.length === 1) {
        reviewOptions.body += `- \`${dependency}\`: [${vulnerabilities[0].advisory.id}](https://rustsec.org/advisories/${vulnerabilities[0].advisory.id})\n`;
      } else {
        reviewOptions.body += `- \`${dependency}\`\n`;
        reviewOptions.body += vulnerabilities
          .map((v) => `  - [${v.advisory.id}](https://rustsec.org/advisories/${v.advisory.id})`)
          .join("\n");
      }
      reviewOptions.body += "\n";
    });

    /**
     * Comments will have the following format:
     * ```md
     * # Vulnerability Report 1 [advisory id 1](https://rustsec.org/advisories/[advisory id 1])
     *
     * ## Dependency Chain
     *
     * `dependency` → **`vulnerable subdependency`**
     *
     * ## [advisory title]
     *
     * [advisory description]
     *
     * # Vulnerability Report 2 [advisory id 2](https://rustsec.org/advisories/[advisory id 2])
     *
     * ...
     * ```
     */
    const manifest = await getTomlManifest();
    reviewOptions.comments = [];
    vulnerableDependenciesMap.forEach((vulnerabilities, dependency) =>
      reviewOptions.comments!.push({
        path: "Cargo.toml",
        line: getManifestLineByDependency(manifest, dependency) || 1,
        body: vulnerabilities
          .map(
            (v) =>
              `# Vulnerability Report [${v.advisory.id}](https://rustsec.org/advisories/${v.advisory.id})\n\n` +
              `## Dependency Chain\n\n` +
              v.chain
                .map((d, i) => (i === 0 ? `**\`${d}\`**` : `\`${d}\``))
                .reverse()
                .join(" → ") +
              "\n\n" +
              `## ${v.advisory.title}\n\n` +
              v.advisory.description,
          )
          .join("\n\n"),
      }),
    );
  } else {
    reviewOptions.event = "APPROVE";
  }

  core.info(`Creating PR review with options:\n${JSON.stringify(reviewOptions, null, 2)}`);
  try {
    const response = await octokit.pulls.createReview(reviewOptions);
    core.info(`Created PR review with response:\n${JSON.stringify(response, null, 2)}`);
  } catch (error) {
    core.info(`Review request failed with error:\n${JSON.stringify(error, null, 2)}`);
    if (error instanceof Error) core.setFailed(error);
    else core.setFailed(JSON.stringify(error));
  }
}

/**
 * Runs the `cargo audit` process and adds PR review comments if any vulnerabilities are found.
 * @returns A promise that resolves when the process is complete.
 */
export async function run(): Promise<CleanupTask[]> {
  const cleanupTasks = newCleanupTasksStore();

  const audit: Audit = await core.group("Running `cargo audit`...", getAudit);

  if ("pull_request" in config.context.event && config.context.event.pull_request) {
    await core.group("Adding PR review comments...", () => reviewPr(audit));
  }

  return cleanupTasks;
}

await runWithHandling(run);
