import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { Errors } from "@oclif/core";

/** A plugin package with one asset, laid out the way `xlr compile` expects */
export function writeFixture(
  dir: string,
  packageJson?: Record<string, unknown>,
) {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  if (packageJson) {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify(packageJson),
    );
  }

  fs.writeFileSync(
    path.join(dir, "src", "index.ts"),
    `
import type { ExtendedPlayerPlugin } from "@player-ui/player";

export interface TestAsset {
  id: string;
  type: "test";
}

export class TestPlugin implements ExtendedPlayerPlugin<[TestAsset]> {
  name = "test-plugin";
}
`,
  );
}

/** Silences `Errors.warn` while capturing what it was called with */
export function spyOnWarn() {
  return vi.spyOn(Errors, "warn").mockImplementation(() => undefined);
}

/** A player config file with `xlr.platformPackages` set inline */
export function writePlayerConfig(
  dir: string,
  platformPackages: Record<string, unknown>,
): string {
  const configPath = path.join(dir, "player.config.json");

  fs.writeFileSync(configPath, JSON.stringify({ xlr: { platformPackages } }));

  return configPath;
}

export function readManifest(dir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "dist", "xlr", "manifest.json"), "utf-8"),
  );
}

/** Writes a source package's compiled manifest + per-capability type files, for `xlr bundle` */
export function writeSource(
  dir: string,
  options: {
    manifestPath?: string;
    packages?: Record<string, unknown>;
    assets?: Array<{ capabilityName: string; typeName: string | undefined }>;
    views?: Array<{ capabilityName: string; typeName: string | undefined }>;
  },
) {
  const manifestPath = options.manifestPath ?? "dist/xlr/manifest.json";
  const manifestDir = path.join(dir, path.dirname(manifestPath));
  fs.mkdirSync(manifestDir, { recursive: true });

  const assets = options.assets ?? [];
  const views = options.views ?? [];

  [...assets, ...views].forEach(({ capabilityName, typeName }) => {
    fs.writeFileSync(
      path.join(manifestDir, `${capabilityName}.json`),
      JSON.stringify(
        typeName === undefined
          ? { name: capabilityName }
          : { extends: { genericArguments: [{ const: typeName }] } },
      ),
    );
  });

  fs.writeFileSync(
    path.join(dir, manifestPath),
    JSON.stringify({
      pluginName: path.basename(dir),
      ...(options.packages ? { packages: options.packages } : {}),
      capabilities: {
        Assets: assets.map((a) => a.capabilityName),
        Views: views.map((v) => v.capabilityName),
      },
    }),
  );
}

/** Reads the manifest `xlr bundle` wrote to `outputDir` */
export function readBundledManifest(outputDir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(outputDir, "xlr", "manifest.json"), "utf-8"),
  );
}
