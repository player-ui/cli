import fs from "fs";
import path from "path";
import { Errors } from "@oclif/core";
import type { PlatformPackages } from "@xlr-lib/xlr";

/** A manifest as `xlr compile` writes it to disk: plain JSON, not the in-memory `Map` shape */
interface SourceManifest {
  pluginName?: string;
  packages?: PlatformPackages;
  capabilities?: Record<string, Array<string>>;
}

/**
 * `DataTypes`/`Formatters`/`Validators`/`Expressions`/`Types` ship as one wholesale package a
 * topic installs outright, never looked up by name, so `bundle` only walks these two.
 */
const BUNDLED_CAPABILITY_TYPES = ["Assets", "Views"] as const;

export interface BundledManifestEntry extends PlatformPackages {
  /**
   * Lets a topic pick between colliding entries, in the shape a
   * `@player-ui/partial-match-registry` discriminator uses at runtime (e.g. `{ kind: "card" }`).
   * Comes from `bundle`'s own config, not the source's manifest.
   */
  metaData?: Record<string, unknown>;
}

export interface BundledManifest {
  capabilities: Record<string, Array<BundledManifestEntry>>;
}

/** The nearest ancestor directory of `file` containing a `package.json`, or undefined if none does */
function findPackageRoot(file: string): string | undefined {
  let dir = path.dirname(file);

  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }

    dir = parent;
  }
}

/**
 * Resolves a `--source` value to a directory: an installed/linked package name, or a literal
 * path. Package resolution goes through the package's main/exports entry point rather than
 * appending `/package.json` directly, since a package's `exports` map commonly doesn't whitelist
 * that subpath.
 */
function resolveSourceDir(source: string): string | undefined {
  try {
    const entryFile = require.resolve(source, { paths: [process.cwd()] });
    const packageRoot = findPackageRoot(entryFile);

    if (packageRoot) {
      return packageRoot;
    }
  } catch {
    // fall through to path resolution below
  }

  const asPath = path.resolve(source);

  if (fs.existsSync(asPath) && fs.statSync(asPath).isDirectory()) {
    return asPath;
  }

  Errors.warn(
    `Could not resolve xlr bundle source "${source}" as a package or a directory; skipping it.`,
  );
  return undefined;
}

function readSourceManifest(manifestFile: string): SourceManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
  } catch {
    Errors.warn(`Could not read ${manifestFile}; skipping this source.`);
    return undefined;
  }
}

/**
 * The type name for a compiled XLR node (e.g. `input` for `Assets.InputAsset`), read from the
 * per-capability `.json` file `xlr compile` writes next to `manifest.json`. This is not the same
 * as the capability name in `manifest.json`'s `Assets`/`Views` list.
 */
function getTypeName(manifestDir: string, capabilityName: string): string {
  const typeFilePath = path.join(manifestDir, `${capabilityName}.json`);

  let node: any;
  try {
    node = JSON.parse(fs.readFileSync(typeFilePath, "utf-8"));
  } catch {
    Errors.error(`Could not read ${typeFilePath}.`);
  }

  const typeName = node?.extends?.genericArguments?.[0]?.const;

  if (typeof typeName !== "string" || !typeName) {
    Errors.error(
      `Could not determine a type name for "${capabilityName}" in ${manifestDir}. This asset's own compiled output is malformed.`,
    );
  }

  return typeName;
}

/**
 * Appends `entry` to `list` unless an identical entry is already present. Two different
 * plugins colliding on the same type name are never identical (different `packages` at least) —
 * this only collapses the same plugin's own repeat under two capabilities, not a real collision.
 */
function appendUnlessIdentical(
  list: Array<BundledManifestEntry>,
  entry: BundledManifestEntry,
) {
  const serialized = JSON.stringify(entry);

  if (list.some((existing) => JSON.stringify(existing) === serialized)) {
    return;
  }

  list.push(entry);
}

/**
 * Flattens each source's `Assets`/`Views` capabilities into one manifest keyed by type name. A
 * name produced by more than one source keeps every entry — resolving the collision is a
 * topic-side concern, not `bundle`'s.
 */
export function bundleManifests(
  sources: Array<string>,
  manifestPath: string,
  metaDataBySource: Record<string, Record<string, unknown>> = {},
): BundledManifest {
  const capabilities: Record<string, Array<BundledManifestEntry>> = {};

  sources.forEach((source) => {
    const sourceDir = resolveSourceDir(source);
    if (!sourceDir) {
      return;
    }

    const manifestFile = path.join(sourceDir, manifestPath);
    const manifest = readSourceManifest(manifestFile);
    if (!manifest) {
      return;
    }

    const manifestDir = path.dirname(manifestFile);
    const metaData = metaDataBySource[source];
    const entry: BundledManifestEntry = {
      ...manifest.packages,
      ...(metaData ? { metaData } : {}),
    };

    BUNDLED_CAPABILITY_TYPES.forEach((capabilityType) => {
      const capabilityNames = manifest.capabilities?.[capabilityType] ?? [];

      capabilityNames.forEach((capabilityName) => {
        const typeName = getTypeName(manifestDir, capabilityName);

        if (!capabilities[typeName]) {
          capabilities[typeName] = [];
        }

        appendUnlessIdentical(capabilities[typeName], entry);
      });
    });
  });

  return { capabilities };
}

export function writeBundledManifest(
  outputDir: string,
  manifest: BundledManifest,
) {
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 4),
  );

  fs.writeFileSync(
    path.join(outputDir, "manifest.js"),
    `module.exports = require("./manifest.json");\n`,
  );
}
