import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import DSLValidate from "../../commands/dsl/validate";

describe("dsl validate command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-test-validate-"));
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("should validate TypeScript files", async () => {
    const tsFile = path.join(testDir, "test.ts");
    await fs.writeFile(
      tsFile,
      'const greeting: string = "hello"; export { greeting };'
    );

    const result = await DSLValidate.run(["-f", tsFile]);

    expect(result).toBeDefined();
    expect(result.exitCode).toBe(0);
  });

  test("should handle multiple files", async () => {
    const file1 = path.join(testDir, "file1.ts");
    const file2 = path.join(testDir, "file2.ts");
    
    await fs.writeFile(file1, 'export const a = 1;');
    await fs.writeFile(file2, 'export const b = 2;');

    const result = await DSLValidate.run(["-f", testDir]);

    expect(result).toBeDefined();
  });

  test("should respect severity flag", async () => {
    const tsFile = path.join(testDir, "test.ts");
    await fs.writeFile(tsFile, 'export const x = 42;');

    const errorResult = await DSLValidate.run([
      "-f", tsFile,
      "-s", "error"
    ]);

    expect(errorResult).toBeDefined();

    const warnResult = await DSLValidate.run([
      "-f", tsFile,
      "-s", "warn"
    ]);

    expect(warnResult).toBeDefined();
  });

  test("should validate directory of files", async () => {
    const srcDir = path.join(testDir, "src");
    await fs.mkdir(srcDir, { recursive: true });
    
    await fs.writeFile(
      path.join(srcDir, "module1.ts"),
      'export const mod1 = "test";'
    );
    await fs.writeFile(
      path.join(srcDir, "module2.ts"),
      'export const mod2 = 123;'
    );

    const result = await DSLValidate.run(["-f", srcDir]);

    expect(result.exitCode).toBe(0);
  });
});
