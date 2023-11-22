// Based on https://github.com/vercel/ncc/blob/0.38.1/src/index.js
declare module "@vercel/ncc" {
  import { Stats } from "webpack";

  interface Options<Watch extends boolean = false> {
    /**
     * Output filename.
     * @default "index.js" // or `.cjs` and `.mjs` depending on `esm` and `entry`
     */
    filename?: string;
    /**
     * Compile as ESM.
     * @default true // If entry ends with `.mjs` or does not end with `.cjs` and package type is module.
     */
    esm?: boolean;
    /**
     * Minify output.
     * @default false
     */
    minify?: boolean;
    /**
     * Source map.
     * @default false
     */
    sourceMap?: boolean;
    /**
     * Base prefix for source maps.
     * @default "../"
     */
    sourceMapBasePrefix?: string;
    /**
     * Register source map support.
     * @default true
     */
    sourceMapRegister?: boolean;
    /**
     * Target ECMAScript version. Will be passed to webpack as `["node14", target]`.
     * @see https://webpack.js.org/configuration/target
     * @default "es2015"
     */
    target?: string;
    /**
     * Custom cache path.
     * @default false
     */
    cache?: string | false;
    /**
     * V8 caching.
     * @default false
     */
    v8cache?: boolean;
    /**
     * The name of the generated license file.
     * Empty string will not generate a license file.
     * @default ""
     */
    license?: string;
    /**
     * Asset builds.
     * @default false
     */
    assetBuilds?: boolean;
    /**
     * Custom functional asset emitter. Takes an asset path and returns the replacement or returns false to skip emission.
     */
    customEmit?: (path: string, options: { id: string; isRequire: boolean }) => false | string;
    /**
     * Directory outside of which never to emit assets.
     * @default process.cwd()
     */
    filterAssetBase?: string;
    /**
     * A list of asset names already emitted or defined that should not be emitted.
     * @default []
     */
    existingAssetNames?: string[];
    /**
     * Externals to leave as requires of the build.
     * @default []
     */
    externals?: string[];
    /**
     * Determine which fields in package.json of imported npm packages are checked.
     * webpack defaults to ["module", "main"], but that's not really what Node.js supports, so `@vercel/ncc` resets it by default.
     * @see https://webpack.js.org/configuration/resolve/#resolvemainfiles
     * @default ["main"]
     */
    mainFields?: string[];
    /**
     * Debug log.
     * @default false
     */
    debugLog?: boolean;
    /**
     * Production mode.
     * @default true
     */
    production?: boolean;
    /**
     * Quiet mode.
     * @default false
     */
    quiet?: boolean;
    /**
     * Transpile only.
     * @default false
     */
    transpileOnly?: boolean;
    /**
     * Watch mode.
     * @default false
     */
    watch?: Watch;
  }

  interface Asset {
    /** Content. */
    source: Buffer | string;
    /** Permissions. */
    permissions?: number;
  }

  interface Return {
    /** Compiled code. */
    code: string;
    /** Source map. */
    map?: string;
    /** Assets. */
    assets?: Record<string, Asset>;
    /** Symlinks. */
    symlinks?: Record<string, string>;
    /** webpack stats. */
    stats: Stats;
  }

  interface WatchHandlerOptions {
    /** Error. */
    err?: Error;
    /** Compiled code. */
    code?: string;
    /** Source map. */
    map?: string;
    /** Assets. */
    assets?: Record<string, Asset>;
  }

  interface WatchReturn {
    /** Function that re-runs on each build completion. */
    handler: (callback: (options: WatchHandlerOptions) => void) => void;
    /** Function that re-runs on each rebuild start. */
    rebuild: (callback: () => void) => void;
    /** Closes the watcher. */
    close: () => void;
  }

  /**
   * Compiles a Node.js module into a single file, together with all its dependencies, gcc-style.
   * @param entry The path to the file.
   * @param options The options for the ncc function.
   * @returns A promise that resolves to the result of the ncc function
   * if `options.watch` is `false`, otherwise an object with `handler`, `rebuild` and `close` functions.
   */
  export default function ncc<Watch extends boolean = false>(
    entry: string,
    options?: Options<Watch>,
  ): Watch extends false ? Promise<Return> : WatchReturn;
}
