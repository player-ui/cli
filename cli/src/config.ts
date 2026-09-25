import type { PlatformPackages } from "@xlr-lib/xlr";
import type { PlayerCLIPlugin } from "./plugins";

export interface PlayerConfigFileShape {
  /** A base config to inherit defaults from */
  extends?: string | PlayerConfigFileShape;

  /** A list of plugins to apply */
  plugins?: Array<string | [string, any] | PlayerCLIPlugin>;

  /** A list of presets to apply */
  presets?: Array<PlayerConfigFileShape | string>;

  /** Options related to XLR compilation step */
  xlr?: PlayerConfigResolvedShape["xlr"];
}

export interface PlayerConfigResolvedShape {
  /** Options related to the DSL and compilation */
  dsl?: {
    /** An input directory for compilation */
    src?: string;

    /** An output directory to use */
    outDir?: string;

    /** Flag to omit validating the resulting JSON */
    skipValidation?: boolean;
  };

  /** Options related to JSON and validation */
  json?: {
    /** An input file, directory, glob, or list of any of the above to use as inputs for validation */
    src?: string | string[];
  };

  /** Options related to XLR compilation step */
  xlr?: {
    /** Path to start searching for types to import/export */
    input?: string;

    /** Where to write the resulting files */
    output?: string;

    /** When converting to XLR, what strategy to use */
    mode?: "plugin" | "types";

    /**
     * A map of npm package name to its ios/android package identity (name + version). For
     * non-Bazel consumers, where ios/android are published from separate repos with no build
     * graph to read those identities from directly, so they're hand-maintained here instead.
     */
    platformPackages?: Record<
      string,
      Pick<PlatformPackages, "ios" | "android">
    >;

    /**
     * Stamped into this package's own compiled manifest, and carried through by `xlr bundle`
     * into every entry this package contributes. Only load-bearing once two packages provide
     * the same type name, where it's what tells their entries apart.
     */
    metaData?: Record<string, unknown>;

    /**
     * The packages (or directories) for `xlr bundle` to collate, as data instead of repeated
     * `--source` flags — the list a decomposed DSL package depends on is expected to grow past
     * what's reasonable to hand-type into a build script command.
     */
    bundleSources?: Array<string>;
  };

  /** Flattened list of plugins */
  plugins: Array<PlayerCLIPlugin>;

  /** Catch for any other things that may be in the config for plugged in functionality */
  [key: string]: any;
}
