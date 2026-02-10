import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import JSONValidate from "../../commands/json/validate";

describe("json validate command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-test-json-"));
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("should validate valid JSON files", async () => {
    const jsonFile = path.join(testDir, "valid.json");
    await fs.writeFile(
      jsonFile,
      JSON.stringify({ id: "test-001", type: "content" })
    );

    const result = await JSONValidate.run(["-i", jsonFile]);
    
    expect(result).toBeDefined();
    expect(result.exitCode).toBe(0);
  });

  test("should handle missing input", async () => {
    await expect(async () => {
      await JSONValidate.run([]);
    }).rejects.toThrow();
  });

  test("should validate multiple JSON files", async () => {
    const file1 = path.join(testDir, "test1.json");
    const file2 = path.join(testDir, "test2.json");
    
    await fs.writeFile(file1, JSON.stringify({ id: "1" }));
    await fs.writeFile(file2, JSON.stringify({ id: "2" }));

    const result = await JSONValidate.run(["-i", testDir]);
    
    expect(result).toBeDefined();
  });

  test("should respect severity flag", async () => {
    const jsonFile = path.join(testDir, "test.json");
    await fs.writeFile(jsonFile, JSON.stringify({ data: "test" }));

    const result = await JSONValidate.run([
      "-i", jsonFile,
      "-s", "warn"
    ]);
    
    expect(result).toBeDefined();
  });
});
