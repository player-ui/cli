import fs from "fs";
import os from "os";
import path from "path";
import { test, expect, describe, beforeEach, afterEach } from "vitest";
import XLRCompile from "../../commands/xlr/compile";
import {
  writeFixture,
  spyOnWarn,
  writePlayerConfig,
  readManifest,
} from "./xlr-test-helpers";

describe("xlr compile package info", () => {
  /** An isolated root, so nothing on the ambient filesystem can be picked up */
  let workspace: string;
  let cwd: string;
  let warn: ReturnType<typeof spyOnWarn>;
  const env = { ...process.env };

  beforeEach(() => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "xlr-compile-")),
    );
    cwd = process.cwd();
    warn = spyOnWarn();
    delete process.env.BAZEL_STABLE_STATUS_FILE;
    delete process.env.BAZEL_PACKAGE;
    delete process.env.XLR_PACKAGE_NAME;
    delete process.env.XLR_IOS_PACKAGE_NAME;
    delete process.env.XLR_ANDROID_PACKAGE_NAME;
    delete process.env.XLR_META_DATA;
    delete process.env.JS_BINARY__EXECROOT;
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    warn.mockRestore();
  });

  describe("non-bazel", () => {
    beforeEach(() => {
      process.chdir(workspace);
    });

    test("records the name and version from package.json", async () => {
      writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });

      await XLRCompile.run(["-i", "src", "-o", "dist"]);

      expect(readManifest(workspace).packages).toStrictEqual({
        react: { name: "@test/plugin", version: "2.3.4" },
      });
    });

    test("omits packages and warns when package.json has no version", async () => {
      writeFixture(workspace, { name: "@test/plugin" });

      await XLRCompile.run(["-i", "src", "-o", "dist"]);

      expect(readManifest(workspace).packages).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('No "version" in'),
      );
    });

    describe("when package.json is missing or incomplete", () => {
      test("omits packages and warns when there is no package.json", async () => {
        writeFixture(workspace);

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).packages).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("Could not read"),
        );
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("Omitting package information"),
        );
      });

      test("omits packages and warns when package.json has no name", async () => {
        writeFixture(workspace, { version: "2.3.4" });

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).packages).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('No "name" in'),
        );
      });
    });

    describe("mobile packages", () => {
      test("records ios and android from config.xlr.platformPackages, keyed by package name", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = writePlayerConfig(workspace, {
          "@test/plugin": {
            ios: { name: "TestPlugin", version: "3.2.1" },
            android: { name: "com.test:plugin", version: "4.0.0" },
          },
        });

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(readManifest(workspace).packages).toStrictEqual({
          react: { name: "@test/plugin", version: "2.3.4" },
          ios: { name: "TestPlugin", version: "3.2.1" },
          android: { name: "com.test:plugin", version: "4.0.0" },
        });
      });

      test("a plugin absent from platformPackages gets react only, no warning", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = writePlayerConfig(workspace, {
          "@some/other-plugin": {
            ios: { name: "Other", version: "1.0.0" },
          },
        });

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(readManifest(workspace).packages).toStrictEqual({
          react: { name: "@test/plugin", version: "2.3.4" },
        });
        expect(warn).not.toHaveBeenCalled();
      });

      test("drops a platform entry missing a version, without affecting the other platform or react", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = writePlayerConfig(workspace, {
          "@test/plugin": {
            ios: { name: "TestPlugin" },
            android: { name: "com.test:plugin", version: "4.0.0" },
          },
        });

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(readManifest(workspace).packages).toStrictEqual({
          react: { name: "@test/plugin", version: "2.3.4" },
          android: { name: "com.test:plugin", version: "4.0.0" },
        });
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/"version".*"ios"/),
        );
      });

      test("drops a platform entry missing a name, naming the missing field", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = writePlayerConfig(workspace, {
          "@test/plugin": {
            android: { version: "4.0.0" },
          },
        });

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(readManifest(workspace).packages).toStrictEqual({
          react: { name: "@test/plugin", version: "2.3.4" },
        });
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/"name".*"android"/),
        );
      });
    });

    describe("metaData", () => {
      test("stamps config.xlr.metaData into the manifest", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = path.join(workspace, "player.config.json");
        fs.writeFileSync(
          configPath,
          JSON.stringify({ xlr: { metaData: { kind: "test" } } }),
        );

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(readManifest(workspace).metaData).toStrictEqual({
          kind: "test",
        });
      });

      test("omits metaData when the config sets none", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).metaData).toBeUndefined();
      });

      test("carries metaData into the manifest.js wrapper too", async () => {
        writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
        const configPath = path.join(workspace, "player.config.json");
        fs.writeFileSync(
          configPath,
          JSON.stringify({ xlr: { metaData: { kind: "test" } } }),
        );

        await XLRCompile.run([
          "-i",
          "src",
          "-o",
          "dist",
          "--config",
          configPath,
        ]);

        expect(
          fs.readFileSync(
            path.join(workspace, "dist", "xlr", "manifest.js"),
            "utf-8",
          ),
        ).toContain('"metaData": {"kind":"test"}');
      });
    });
  });

  describe("bazel", () => {
    // Bazel runs from the workspace root and names the package in BAZEL_PACKAGE, so the
    // working directory alone does not identify the package.
    const pkgPath = path.join("plugins", "test-plugin");

    beforeEach(() => {
      // a workspace root package.json that must never be picked up
      fs.writeFileSync(
        path.join(workspace, "package.json"),
        JSON.stringify({ name: "workspace-root", version: "0.0.0" }),
      );
      process.chdir(workspace);
      process.env.BAZEL_PACKAGE = pkgPath;
    });

    test("takes the name from XLR_PACKAGE_NAME and the version from the stamp", async () => {
      // No package.json in the package: Bazel does not stage one, it passes the name instead
      writeFixture(path.join(workspace, pkgPath));
      process.env.XLR_PACKAGE_NAME = "@test/plugin";
      const statusFile = path.join(workspace, "stable-status.txt");
      fs.writeFileSync(statusFile, "STABLE_VERSION 1.1.0\n");
      process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

      await XLRCompile.run([
        "-i",
        path.join(pkgPath, "src"),
        "-o",
        path.join(pkgPath, "dist"),
      ]);

      expect(
        readManifest(path.join(workspace, pkgPath)).packages,
      ).toStrictEqual({
        react: { name: "@test/plugin", version: "1.1.0" },
      });
    });

    test("resolves an execroot-relative stamp path against the execroot", async () => {
      // Bazel names the status file relative to the execroot, but the js_binary launcher
      // runs the tool from BAZEL_BINDIR, so a relative path does not resolve against cwd.
      writeFixture(path.join(workspace, pkgPath));
      process.env.XLR_PACKAGE_NAME = "@test/plugin";
      fs.mkdirSync(path.join(workspace, "bazel-out"), { recursive: true });
      fs.writeFileSync(
        path.join(workspace, "bazel-out", "stable-status.txt"),
        "STABLE_VERSION 1.2.0-next.7\n",
      );
      process.env.BAZEL_STABLE_STATUS_FILE = "bazel-out/stable-status.txt";
      process.env.JS_BINARY__EXECROOT = workspace;

      const bindir = path.join(workspace, "bazel-out", "bin");
      fs.mkdirSync(bindir, { recursive: true });
      process.chdir(bindir);

      await XLRCompile.run([
        "-i",
        path.join(workspace, pkgPath, "src"),
        "-o",
        path.join(workspace, pkgPath, "dist"),
      ]);

      expect(
        readManifest(path.join(workspace, pkgPath)).packages,
      ).toStrictEqual({
        react: { name: "@test/plugin", version: "1.2.0-next.7" },
      });
    });

    test("omits packages and warns when not stamped", async () => {
      // Bazel always provides the status file (ctx.info_file exists on every build), but
      // without `--stamp` its content has no STABLE_VERSION line — the env var being unset
      // entirely isn't how an unstamped build actually looks.
      writeFixture(path.join(workspace, pkgPath));
      process.env.XLR_PACKAGE_NAME = "@test/plugin";
      const statusFile = path.join(workspace, "stable-status.txt");
      fs.writeFileSync(statusFile, "");
      process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

      await XLRCompile.run([
        "-i",
        path.join(pkgPath, "src"),
        "-o",
        path.join(pkgPath, "dist"),
      ]);

      expect(
        readManifest(path.join(workspace, pkgPath)).packages,
      ).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("No stamped version"),
      );
    });

    describe("when package.json is missing or incomplete", () => {
      // These exercise react's name-fallback failing; a stamp is needed so the function gets
      // past the version check to attempt that fallback at all.
      beforeEach(() => {
        const statusFile = path.join(workspace, "stable-status.txt");
        fs.writeFileSync(statusFile, "STABLE_VERSION 1.1.0\n");
        process.env.BAZEL_STABLE_STATUS_FILE = statusFile;
      });

      test("omits packages and warns when neither XLR_PACKAGE_NAME nor package.json is available", async () => {
        writeFixture(path.join(workspace, pkgPath));

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(path.join(pkgPath, "package.json")),
        );
      });

      test("omits packages when package.json has no name", async () => {
        writeFixture(path.join(workspace, pkgPath), { version: "2.3.4" });

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toBeUndefined();
      });
    });

    describe("mobile packages", () => {
      test("records ios and android names from env vars, sharing the stamped version", async () => {
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_PACKAGE_NAME = "@test/plugin";
        process.env.XLR_IOS_PACKAGE_NAME = "PlayerUIReferenceAssets";
        process.env.XLR_ANDROID_PACKAGE_NAME =
          "com.intuit.playerui.plugins:reference-assets";
        const statusFile = path.join(workspace, "stable-status.txt");
        fs.writeFileSync(statusFile, "STABLE_VERSION 1.1.0\n");
        process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toStrictEqual({
          react: { name: "@test/plugin", version: "1.1.0" },
          ios: { name: "PlayerUIReferenceAssets", version: "1.1.0" },
          android: {
            name: "com.intuit.playerui.plugins:reference-assets",
            version: "1.1.0",
          },
        });
      });

      test("omits ios when only its env var is unset, without affecting android or react", async () => {
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_PACKAGE_NAME = "@test/plugin";
        process.env.XLR_ANDROID_PACKAGE_NAME =
          "com.intuit.playerui.plugins:reference-assets";
        const statusFile = path.join(workspace, "stable-status.txt");
        fs.writeFileSync(statusFile, "STABLE_VERSION 1.1.0\n");
        process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toStrictEqual({
          react: { name: "@test/plugin", version: "1.1.0" },
          android: {
            name: "com.intuit.playerui.plugins:reference-assets",
            version: "1.1.0",
          },
        });
      });

      test("react's absence does not suppress ios/android", async () => {
        // No package.json and no XLR_PACKAGE_NAME: react's name cannot be resolved.
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_IOS_PACKAGE_NAME = "PlayerUIReferenceAssets";
        const statusFile = path.join(workspace, "stable-status.txt");
        fs.writeFileSync(statusFile, "STABLE_VERSION 1.1.0\n");
        process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toStrictEqual({
          ios: { name: "PlayerUIReferenceAssets", version: "1.1.0" },
        });
      });

      test("omits ios/android when not stamped, even with env vars set", async () => {
        // Same real-world shape as the react-only "not stamped" case above: the status file
        // exists, it just has no STABLE_VERSION line.
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_PACKAGE_NAME = "@test/plugin";
        process.env.XLR_IOS_PACKAGE_NAME = "PlayerUIReferenceAssets";
        process.env.XLR_ANDROID_PACKAGE_NAME =
          "com.intuit.playerui.plugins:reference-assets";
        const statusFile = path.join(workspace, "stable-status.txt");
        fs.writeFileSync(statusFile, "");
        process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).packages,
        ).toBeUndefined();
      });
    });

    describe("metaData", () => {
      test("stamps XLR_META_DATA into the manifest", async () => {
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_META_DATA = JSON.stringify({ kind: "test" });

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).metaData,
        ).toStrictEqual({ kind: "test" });
      });

      test("omits metaData and warns when XLR_META_DATA is not valid JSON", async () => {
        writeFixture(path.join(workspace, pkgPath));
        process.env.XLR_META_DATA = "{kind:test}";

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).metaData,
        ).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("XLR_META_DATA"),
        );
      });

      test("omits metaData when XLR_META_DATA is unset", async () => {
        writeFixture(path.join(workspace, pkgPath));

        await XLRCompile.run([
          "-i",
          path.join(pkgPath, "src"),
          "-o",
          path.join(pkgPath, "dist"),
        ]);

        expect(
          readManifest(path.join(workspace, pkgPath)).metaData,
        ).toBeUndefined();
      });
    });
  });
});
