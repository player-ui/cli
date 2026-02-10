import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import DSLCompile from "../../commands/dsl/compile";
import stdMocks from "std-mocks";

describe("dsl compile command", () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-test-"));
    outputDir = path.join(testDir, "output");
    
    // Set NODE_ENV to test to prevent exit
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("should require input parameter", async () => {
    await expect(async () => {
      await DSLCompile.run([]);
    }).rejects.toThrow("Input files are required");
  });

  test("should accept input and output flags", async () => {
    const inputPath = path.join(testDir, "input");
    await fs.mkdir(inputPath, { recursive: true });
    
    // Create a minimal test file
    const testFile = path.join(inputPath, "test.ts");
    await fs.writeFile(testFile, 'export const data = { id: "test" };');

    stdMocks.use();
    const result = await DSLCompile.run([
      "-i", inputPath,
      "-o", outputDir,
      "--skip-validation"
    ]);
    stdMocks.restore();

    expect(result).toBeDefined();
    expect(result.exitCode).toBe(0);
  });

  test("should handle missing input directory", async () => {
    const nonExistentPath = path.join(testDir, "nonexistent");
    
    const result = await DSLCompile.run([
      "-i", nonExistentPath,
      "-o", outputDir,
      "--skip-validation"
    ]);

    // Should complete even with no files found
    expect(result.exitCode).toBe(0);
  });

  test("should respect skip-validation flag", async () => {
    const inputPath = path.join(testDir, "input");
    await fs.mkdir(inputPath, { recursive: true });

    const result = await DSLCompile.run([
      "-i", inputPath,
      "-o", outputDir,
      "--skip-validation"
    ]);

    expect(result).toBeDefined();
  });

  test("should use default output directory when not specified", async () => {
    const inputPath = path.join(testDir, "input");
    await fs.mkdir(inputPath, { recursive: true });

    const result = await DSLCompile.run([
      "-i", inputPath,
      "--skip-validation"
    ]);

    expect(result.exitCode).toBe(0);
  });
});
