import fs from "fs";
import os from "os";
import path from "path";
import { test, expect, describe, beforeEach, afterEach } from "vitest";
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

function readManifest(dir: string) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "dist", "xlr", "manifest.json"), "utf-8"),
  );
}

describe("xlr compile package info", () => {
  /** An isolated root, so nothing on the ambient filesystem can be picked up */
  let workspace: string;
  let cwd: string;
  const env = { ...process.env };

  beforeEach(() => {
    workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "xlr-compile-")),
    );
    cwd = process.cwd();
    delete process.env.BAZEL_STABLE_STATUS_FILE;
    delete process.env.BAZEL_PACKAGE;
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
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

    test("ignores a stamped version when not run under Bazel", async () => {
      // package.json is authoritative here, so a stray status file must not override it
      writeFixture(workspace, { name: "@test/plugin", version: "2.3.4" });
      const statusFile = path.join(workspace, "stable-status.txt");
      fs.writeFileSync(
        statusFile,
        "STABLE_GIT_COMMIT abc123\nSTABLE_VERSION 9.9.9\n",
      );
      process.env.BAZEL_STABLE_STATUS_FILE = statusFile;

      await XLRCompile.run(["-i", "src", "-o", "dist"]);

      expect(readManifest(workspace).packages).toStrictEqual({
        react: { name: "@test/plugin", version: "2.3.4" },
      });
    });

    describe("when package.json is missing or incomplete", () => {
      test("omits packages when there is no package.json", async () => {
        writeFixture(workspace);

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).packages).toBeUndefined();
      });

      test("omits packages when package.json has no name", async () => {
        writeFixture(workspace, { version: "2.3.4" });

        await XLRCompile.run(["-i", "src", "-o", "dist"]);

        expect(readManifest(workspace).packages).toBeUndefined();
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

    test("reads the name from package.json and the version from the stamped status file", async () => {
      writeFixture(path.join(workspace, pkgPath), {
        name: "@test/plugin",
        version: "0.0.0-PLACEHOLDER",
      });
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

    test("omits the version rather than emitting the placeholder, when not stamped", async () => {
      writeFixture(path.join(workspace, pkgPath), {
        name: "@test/plugin",
        version: "0.0.0-PLACEHOLDER",
      });

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
      test("omits packages when there is no package.json at BAZEL_PACKAGE", async () => {
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
