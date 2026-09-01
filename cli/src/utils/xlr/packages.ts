import fs from "fs";
import path from "path";
import type { PlatformPackages } from "@xlr-lib/xlr";

/**
 * Where the npm name and version of the package being compiled come from.
 *
 * | | name | version |
 * | --- | --- | --- |
 * | Bazel (`BAZEL_PACKAGE` is set) | `XLR_PACKAGE_NAME`, else the package's `package.json` | the `STABLE_VERSION` stamp |
 * | anywhere else | `XLR_PACKAGE_NAME`, else the package's `package.json` | the package's `package.json` |
 *
 * Only the version differs between the two: under Bazel the version in `package.json` is a
 * placeholder that is substituted at publish time, so the stamp is the only real source.
 * Elsewhere the package manager keeps `package.json` current and it is read directly.
 */

export type WarnFn = (message: string) => void;

/** Whether this compile is running as a Bazel action */
function isBazel(): boolean {
  return Boolean(process.env.BAZEL_PACKAGE);
}

/**
 * The directory of the package being compiled.
 *
 * Bazel runs from the workspace root and names the package in `BAZEL_PACKAGE`; everywhere
 * else the working directory is already the package.
 */
function getPackageDir(): string {
  const bazelPackage = process.env.BAZEL_PACKAGE;

  return bazelPackage
    ? path.resolve(process.cwd(), bazelPackage)
    : process.cwd();
}

/** The parsed `package.json` of the package being compiled, or undefined if there isn't a readable one */
function getPackageJson(
  packageDir: string,
): Record<string, unknown> | undefined {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"),
    );
  } catch {
    return undefined;
  }
}

/** The `name` of a `package.json`, warning about whatever made it unavailable */
function getPackageJsonName(
  packageDir: string,
  packageJson: Record<string, unknown> | undefined,
  warn: WarnFn,
): string | undefined {
  const packageJsonPath = path.join(packageDir, "package.json");

  if (!packageJson) {
    warn(
      `No readable package.json at ${packageJsonPath}. Omitting package information from the manifest.`,
    );
    return undefined;
  }

  const { name } = packageJson;

  if (typeof name !== "string" || !name) {
    warn(
      `No "name" in ${packageJsonPath}. Omitting package information from the manifest.`,
    );
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

/** The version Bazel stamped this build with, read from the stable status file */
function getStampedVersion(): string | undefined {
  const statusFile = process.env.BAZEL_STABLE_STATUS_FILE;

  if (!statusFile || !fs.existsSync(statusFile)) {
    return undefined;
  }

  const line = fs
    .readFileSync(statusFile, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("STABLE_VERSION "));

  return line?.slice("STABLE_VERSION ".length).trim() || undefined;
}

/**
 * The npm package that provides the capabilities being compiled, or undefined if its name
 * cannot be determined.
 */
export function getPackages(warn: WarnFn): PlatformPackages | undefined {
  const packageDir = getPackageDir();
  const packageJson = getPackageJson(packageDir);

  // Bazel only knows the package path, so it passes the npm name through the environment.
  const name =
    process.env.XLR_PACKAGE_NAME ||
    getPackageJsonName(packageDir, packageJson, warn);

  if (!name) {
    return undefined;
  }

  const version = isBazel()
    ? getStampedVersion()
    : getPackageJsonVersion(packageJson);

  // TODO: only `react` is generated, because XLR is compiled from TypeScript and there is no
  // equivalent for iOS or Android. Native configurations will be added later.
  return {
    react: { name, ...(version ? { version } : {}) },
  };
}
