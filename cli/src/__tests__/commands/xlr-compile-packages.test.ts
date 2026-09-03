import fs from "fs";
import os from "os";
import path from "path";
import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import XLRCompile from "../../commands/xlr/compile";

/** A plugin package with one asset, laid out the way `xlr compile` expects */
function writeFixture(dir: string, packageJson?: Record<string, unknown>) {
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

/** Silences `this.warn` while capturing what it was called with */
function spyOnWarn() {
  return vi
    .spyOn(XLRCompile.prototype, "warn")
    .mockImplementation((input) => input);
}

function readManifest(dir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "dist", "xlr", "manifest.json"), "utf-8"),
  );
}

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

    test("records the name alone when package.json has no version", async () => {
      writeFixture(workspace, { name: "@test/plugin" });

      await XLRCompile.run(["-i", "src", "-o", "dist"]);

      expect(readManifest(workspace).packages).toStrictEqual({
        react: { name: "@test/plugin" },
      });
    });

    // The omission must be noisy: a manifest silently losing its `packages` key is the
    // failure mode this whole path exists to prevent.
    describe("when package.json is missing or incomplete", () => {
      test("omits packages and warns when there is no package.json", async () => {
        writeFixture(workspace);

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).packages).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("No readable package.json"),
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

    test("omits the version when not stamped", async () => {
      writeFixture(path.join(workspace, pkgPath));
      process.env.XLR_PACKAGE_NAME = "@test/plugin";

      await XLRCompile.run([
        "-i",
        path.join(pkgPath, "src"),
        "-o",
        path.join(pkgPath, "dist"),
      ]);

      expect(
        readManifest(path.join(workspace, pkgPath)).packages,
      ).toStrictEqual({
        react: { name: "@test/plugin" },
      });
    });

    describe("when package.json is missing or incomplete", () => {
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
  });
});
