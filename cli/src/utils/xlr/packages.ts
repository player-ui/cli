import fs from "fs";
import path from "path";
import { Errors } from "@oclif/core";
import type { PlatformPackages } from "@xlr-lib/xlr";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The packages that provide the capabilities being compiled, keyed by platform, or undefined
 * if none of them can be determined.
 *
 * Bazel runs from the workspace root and names the package in `BAZEL_PACKAGE`; everywhere else
 * the working directory is already the package. That's also the one signal for which path
 * applies below.
 */
export function getPackages(
  platformPackages?: Record<string, Pick<PlatformPackages, "ios" | "android">>,
): PlatformPackages | undefined {
  const bazelPackage = process.env.BAZEL_PACKAGE;
  const packageDir = bazelPackage
    ? path.resolve(process.cwd(), bazelPackage)
    : process.cwd();

  const packages = bazelPackage
    ? getBazelPackages(packageDir)
    : getLocalPackages(packageDir, platformPackages);

  if (!packages) {
    Errors.warn("Omitting package information from the manifest.");
  }

  return packages;
}

// ---------------------------------------------------------------------------
// Bazel: react/ios/android names come from env vars Bazel passes per
// platform (react falls back to package.json if unset); version is the one
// Bazel stamp shared by all platforms in a release.
// ---------------------------------------------------------------------------

/** The version Bazel stamped this build with, read from the stable status file */
function getStampedVersion(): string | undefined {
  const statusFile = process.env.BAZEL_STABLE_STATUS_FILE;

  if (!statusFile) {
    return undefined;
  }

  // Bazel names the status file relative to the execroot (`File.path`), but the js_binary
  // launcher changes directory out of the execroot into BAZEL_BINDIR before running the
  // tool, so re-anchor the path before reading it.
  const execroot = process.env.JS_BINARY__EXECROOT;
  const resolved = execroot ? path.join(execroot, statusFile) : statusFile;

  if (!fs.existsSync(resolved)) {
    return undefined;
  }

  const line = fs
    .readFileSync(resolved, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("STABLE_VERSION "));

  return line?.slice("STABLE_VERSION ".length).trim() || undefined;
}

function getBazelPackages(packageDir: string): PlatformPackages | undefined {
  const version = getStampedVersion();

  // All three platforms share this one stamp; a build without it can't produce a complete
  // entry for any of them, so bail out once instead of warning per platform below.
  if (!version) {
    Errors.warn(
      "No stamped version; omitting package information from the manifest.",
    );
    return undefined;
  }

  const reactName =
    process.env.XLR_PACKAGE_NAME ||
    getPackageJsonName(packageDir, getPackageJson(packageDir));
  const iosName = process.env.XLR_IOS_PACKAGE_NAME;
  const androidName = process.env.XLR_ANDROID_PACKAGE_NAME;

  const packages: PlatformPackages = {
    ...(reactName ? { react: { name: reactName, version } } : {}),
    ...(iosName ? { ios: { name: iosName, version } } : {}),
    ...(androidName ? { android: { name: androidName, version } } : {}),
  };

  return Object.keys(packages).length > 0 ? packages : undefined;
}

// ---------------------------------------------------------------------------
// Non-Bazel: react from package.json. There's no build graph here to read
// ios/android from — those live in entirely separate repos with their own
// release cadence — so they come from an optional, hand-maintained map
// instead (config.xlr.platformPackages).
// ---------------------------------------------------------------------------

function getLocalPackages(
  packageDir: string,
  platformPackages:
    | Record<string, Pick<PlatformPackages, "ios" | "android">>
    | undefined,
): PlatformPackages | undefined {
  const packageJson = getPackageJson(packageDir);
  const name = getPackageJsonName(packageDir, packageJson);

  if (!name) {
    return undefined;
  }

  const version = getPackageJsonVersion(packageJson);

  if (!version) {
    Errors.warn(`No "version" in ${path.join(packageDir, "package.json")}.`);
    return undefined;
  }

  const mobilePackages = platformPackages
    ? getMobilePackages(platformPackages, name)
    : undefined;

  return { react: { name, version }, ...mobilePackages };
}

/**
 * The ios/android entry for `packageName` in `platformPackages`, if any. A package absent from
 * the map simply has no mobile packages, silently — not an error.
 */
function getMobilePackages(
  platformPackages: Record<string, Pick<PlatformPackages, "ios" | "android">>,
  packageName: string,
): Pick<PlatformPackages, "ios" | "android"> | undefined {
  const entry = platformPackages[packageName];

  if (!entry) {
    return undefined;
  }

  const packages: Pick<PlatformPackages, "ios" | "android"> = {};

  (["ios", "android"] as const).forEach((platform) => {
    const platformPackage = entry[platform];

    if (!platformPackage) {
      return;
    }

    if (!platformPackage.name) {
      Errors.warn(
        `No "name" for "${platform}" of "${packageName}" in config.xlr.platformPackages; omitting it from the manifest.`,
      );
      return;
    }

    if (!platformPackage.version) {
      Errors.warn(
        `No "version" for "${platform}" of "${packageName}" in config.xlr.platformPackages; omitting it from the manifest.`,
      );
      return;
    }

    packages[platform] = platformPackage;
  });

  return packages;
}

// ---------------------------------------------------------------------------
// Shared: package.json helpers, used by both the Bazel and non-Bazel paths above.
// ---------------------------------------------------------------------------

/** The parsed `package.json` of the package being compiled, or undefined if there isn't a readable one */
function getPackageJson(
  packageDir: string,
): Record<string, unknown> | undefined {
  const packageJsonPath = path.join(packageDir, "package.json");

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    Errors.warn(
      `Could not read ${packageJsonPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

/** The `name` of a `package.json`, warning if there isn't one */
function getPackageJsonName(
  packageDir: string,
  packageJson: Record<string, unknown> | undefined,
): string | undefined {
  if (!packageJson) {
    // getPackageJson already warned about why it is unavailable
    return undefined;
  }

  const { name } = packageJson;

  if (typeof name !== "string" || !name) {
    Errors.warn(`No "name" in ${path.join(packageDir, "package.json")}.`);
    return undefined;
  }

  return name;
}

/** The `version` of a `package.json` */
function getPackageJsonVersion(
  packageJson: Record<string, unknown> | undefined,
): string | undefined {
  const version = packageJson?.version;

  return typeof version === "string" && version ? version : undefined;
}
