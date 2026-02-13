import { describe, test, expect } from "vitest";
import DSLCompile from "../../commands/dsl/compile";
import DSLValidate from "../../commands/dsl/validate";
import JSONValidate from "../../commands/json/validate";
import XLRCompile from "../../commands/xlr/compile";
import XLRConvert from "../../commands/xlr/convert";

describe("command structure and basic functionality", () => {
  test("DSL compile command should be defined with correct structure", () => {
    expect(DSLCompile).toBeDefined();
    expect(DSLCompile.description).toBe("Compile Player DSL files into JSON");
    expect(DSLCompile.flags).toBeDefined();
    expect(DSLCompile.flags.input).toBeDefined();
    expect(DSLCompile.flags.output).toBeDefined();
    expect(DSLCompile.strict).toBe(false);
  });

  test("DSL validate command should be defined with correct structure", () => {
    expect(DSLValidate).toBeDefined();
    expect(DSLValidate.description).toBe(
      "Validate TSX files before they get compiled",
    );
    expect(DSLValidate.flags).toBeDefined();
    expect(DSLValidate.flags.files).toBeDefined();
    expect(DSLValidate.flags.severity).toBeDefined();
  });

  test("JSON validate command should be defined with correct structure", () => {
    expect(JSONValidate).toBeDefined();
    expect(JSONValidate.description).toBe("Validate Player JSON content");
    expect(JSONValidate.flags).toBeDefined();
    expect(JSONValidate.flags.files).toBeDefined();
    expect(JSONValidate.flags.severity).toBeDefined();
  });

  test("XLR compile command should be defined with correct structure", () => {
    expect(XLRCompile).toBeDefined();
    expect(XLRCompile.description).toBe(
      "Compiles typescript files to XLRs format",
    );
    expect(XLRCompile.flags).toBeDefined();
    expect(XLRCompile.flags.input).toBeDefined();
    expect(XLRCompile.flags.output).toBeDefined();
    expect(XLRCompile.flags.mode).toBeDefined();
  });

  test("XLR convert command should be defined with correct structure", () => {
    expect(XLRConvert).toBeDefined();
    expect(XLRConvert.description).toBe(
      "Exports XLRs files to a specific language",
    );
    expect(XLRConvert.flags).toBeDefined();
    expect(XLRConvert.flags.input).toBeDefined();
    expect(XLRConvert.flags.output).toBeDefined();
    expect(XLRConvert.flags.lang).toBeDefined();
  });

  test("all commands extend BaseCommand and have required config support", () => {
    expect(DSLCompile.flags.config).toBeDefined();
    expect(DSLValidate.flags.config).toBeDefined();
    expect(JSONValidate.flags.config).toBeDefined();
    expect(XLRCompile.flags.config).toBeDefined();
    expect(XLRConvert.flags.config).toBeDefined();
  });
});
