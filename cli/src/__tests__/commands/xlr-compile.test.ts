import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import XLRCompile from "../../commands/xlr/compile";

describe("xlr compile command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-test-xlr-"));
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("should run with default parameters", async () => {
    // Create default source directory
    const srcDir = path.join(testDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    // Change to test dir so defaults work
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const result = await XLRCompile.run([]);
      expect(result).toBeDefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("should handle empty source directory", async () => {
    const srcDir = path.join(testDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const result = await XLRCompile.run([]);
      expect(result).toBeDefined();
    } finally {
      process.chdir(originalCwd);
    }
  });
});
