import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import XLRConvert from "../../commands/xlr/convert";

describe("xlr convert command", () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-test-convert-"));
    outputDir = path.join(testDir, "converted");
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("should convert XLR files", async () => {
    const inputDir = path.join(testDir, "xlr");
    await fs.mkdir(inputDir, { recursive: true });

    const result = await XLRConvert.run([
      "-i", inputDir,
      "-o", outputDir,
      "-l", "TypeScript"
    ]);

    expect(result).toBeDefined();
  });

  test("should accept language flag", async () => {
    const inputDir = path.join(testDir, "xlr");
    await fs.mkdir(inputDir, { recursive: true });

    const result = await XLRConvert.run([
      "-i", inputDir,
      "-o", outputDir,
      "-l", "TypeScript"
    ]);

    expect(result).toBeDefined();
  });

  test("should handle empty input directory", async () => {
    const inputDir = path.join(testDir, "empty");
    await fs.mkdir(inputDir, { recursive: true });

    const result = await XLRConvert.run([
      "-i", inputDir,
      "-o", outputDir,
      "-l", "TypeScript"
    ]);

    expect(result).toBeDefined();
  });
});
