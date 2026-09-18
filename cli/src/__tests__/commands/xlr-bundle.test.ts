import fs from "fs";
import os from "os";
import path from "path";
import { test, expect, describe, beforeEach, afterEach } from "vitest";
import XLRBundle from "../../commands/xlr/bundle";
import {
  spyOnWarn,
  writeSource,
  readBundledManifest,
} from "./xlr-test-helpers";

describe("xlr bundle", () => {
  let workspace: string;
  let cwd: string;
  let warn: ReturnType<typeof spyOnWarn>;

  beforeEach(() => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "xlr-bundle-")),
    );
    cwd = process.cwd();
    process.chdir(workspace);
    warn = spyOnWarn();
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(workspace, { recursive: true, force: true });
    warn.mockRestore();
  });

  /**
   * These exercise `bundle`'s core flattening/collision/error behavior via explicit `-s` flags —
   * the only input mechanism `rules_player`'s `xlr_bundle` macro uses (it never writes a config
   * file, so `config.xlr.bundleSources`/`bundleMetaData` are unreachable from Bazel). Behavior
   * covered here applies identically under Bazel and non-Bazel invocation.
   */
  describe("via --source flags", () => {
    test("flattens Assets/Views into one manifest keyed by type name", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
        views: [{ capabilityName: "Views.SummaryAsset", typeName: "summary" }],
      });

      const sourceB = path.join(workspace, "source-b");
      writeSource(sourceB, {
        packages: { react: { name: "@test/b", version: "2.0.0" } },
        assets: [{ capabilityName: "Assets.TextAsset", typeName: "text" }],
      });

      await XLRBundle.run(["-s", sourceA, "-s", sourceB, "-o", "out"]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {
          input: [{ react: { name: "@test/a", version: "1.0.0" } }],
          summary: [{ react: { name: "@test/a", version: "1.0.0" } }],
          text: [{ react: { name: "@test/b", version: "2.0.0" } }],
        },
      });
    });

    test("collapses a duplicate entry from the same source under two capabilities", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.ActionCard", typeName: "action" }],
        views: [{ capabilityName: "Views.ActionCardView", typeName: "action" }],
      });

      await XLRBundle.run(["-s", sourceA, "-o", "out"]);

      expect(
        readBundledManifest(path.join(workspace, "out")).capabilities.action,
      ).toStrictEqual([{ react: { name: "@test/a", version: "1.0.0" } }]);
    });

    test("ignores DataTypes/Formatters/Validators/Expressions entirely", async () => {
      const sourceA = path.join(workspace, "source-a");
      const manifestDir = path.join(sourceA, "dist", "xlr");
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceA, "dist", "xlr", "manifest.json"),
        JSON.stringify({
          pluginName: "source-a",
          capabilities: {
            Assets: [],
            Views: [],
            DataTypes: ["DataTypes.Foo"],
            Formatters: ["Formatters.Bar"],
          },
        }),
      );

      await XLRBundle.run(["-s", sourceA, "-o", "out"]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {},
      });
    });

    test("respects --manifestPath for a non-default convention", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        manifestPath: "build/out/manifest.json",
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
      });

      await XLRBundle.run([
        "-s",
        sourceA,
        "--manifestPath",
        "build/out/manifest.json",
        "-o",
        "out",
      ]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {
          input: [{ react: { name: "@test/a", version: "1.0.0" } }],
        },
      });
    });

    test("resolves a --source given as an installed package name", async () => {
      const pkgDir = path.join(workspace, "node_modules", "@test", "a");
      writeSource(pkgDir, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
      });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          name: "@test/a",
          version: "1.0.0",
          main: "index.js",
        }),
      );
      fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {};");

      await XLRBundle.run(["-s", "@test/a", "-o", "out"]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {
          input: [{ react: { name: "@test/a", version: "1.0.0" } }],
        },
      });
    });

    test("warns and skips a source with no readable manifest.json, without failing the run", async () => {
      await XLRBundle.run([
        "-s",
        path.join(workspace, "does-not-exist"),
        "-o",
        "out",
      ]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("does-not-exist"),
      );
      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {},
      });
    });

    test("fails when a capability's type file has no type name", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.WeirdAsset", typeName: undefined }],
      });

      await expect(XLRBundle.run(["-s", sourceA, "-o", "out"])).rejects.toThrow(
        /Assets\.WeirdAsset/,
      );
    });

    test("writes a manifest.js wrapper that re-exports the JSON", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
      });

      await XLRBundle.run(["-s", sourceA, "-o", "out"]);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wrapped = require(
        path.join(workspace, "out", "xlr", "manifest.js"),
      );
      expect(wrapped).toStrictEqual(
        readBundledManifest(path.join(workspace, "out")),
      );
    });
  });

  /**
   * `config.xlr.bundleSources`/`bundleMetaData` are the non-Bazel path only — how
   * `cg-player-plugin-web`'s `components` package supplies its source list and collision labels
   * without hand-typing `-s`/`-c` flags into a build script. Bazel's `xlr_bundle` macro always
   * uses explicit `-s` flags instead (see the sibling describe block above).
   */
  describe("via config.xlr.bundleSources / bundleMetaData (non-Bazel only)", () => {
    test("reads the source list from config.xlr.bundleSources when no --source flags are given", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
      });

      const configPath = path.join(workspace, "player.config.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({ xlr: { bundleSources: [sourceA] } }),
      );

      await XLRBundle.run(["-o", "out", "--config", configPath]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {
          input: [{ react: { name: "@test/a", version: "1.0.0" } }],
        },
      });
    });

    test("--source flags override config.xlr.bundleSources when given", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.InputAsset", typeName: "input" }],
      });

      const sourceB = path.join(workspace, "source-b");
      writeSource(sourceB, {
        packages: { react: { name: "@test/b", version: "2.0.0" } },
        assets: [{ capabilityName: "Assets.TextAsset", typeName: "text" }],
      });

      const configPath = path.join(workspace, "player.config.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({ xlr: { bundleSources: [sourceA] } }),
      );

      await XLRBundle.run(["-s", sourceB, "-o", "out", "--config", configPath]);

      expect(readBundledManifest(path.join(workspace, "out"))).toStrictEqual({
        capabilities: {
          text: [{ react: { name: "@test/b", version: "2.0.0" } }],
        },
      });
    });

    test("keeps every entry when two sources provide the same type name, tagging with config.xlr.bundleMetaData", async () => {
      const sourceA = path.join(workspace, "source-a");
      writeSource(sourceA, {
        packages: { react: { name: "@test/a", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.ActionAsset", typeName: "action" }],
      });

      const sourceB = path.join(workspace, "source-b");
      writeSource(sourceB, {
        packages: { react: { name: "@test/custom-action", version: "1.0.0" } },
        assets: [{ capabilityName: "Assets.ActionAsset", typeName: "action" }],
      });

      const configPath = path.join(workspace, "player.config.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          xlr: { bundleMetaData: { [sourceB]: { kind: "card" } } },
        }),
      );

      await XLRBundle.run([
        "-s",
        sourceA,
        "-s",
        sourceB,
        "-o",
        "out",
        "--config",
        configPath,
      ]);

      expect(
        readBundledManifest(path.join(workspace, "out")).capabilities.action,
      ).toStrictEqual([
        { react: { name: "@test/a", version: "1.0.0" } },
        {
          react: { name: "@test/custom-action", version: "1.0.0" },
          metaData: { kind: "card" },
        },
      ]);
    });
  });
});
