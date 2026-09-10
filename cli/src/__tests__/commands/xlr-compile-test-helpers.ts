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
