import path from "path";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../utils/base-command";
import { bundleManifests, writeBundledManifest } from "../../utils/xlr/bundle";

/**
 * Aggregates several packages' compiled XLR manifests into one collated manifest, keyed by
 * type name instead of by source package, scoped to `Assets`/`Views` only.
 */
export default class XLRBundle extends BaseCommand {
  static description =
    "Collates several packages' compiled xlr manifests (Assets/Views only) into one manifest, keyed by type name";

  static flags = {
    ...BaseCommand.flags,
    source: Flags.string({
      char: "s",
      description:
        "A package (resolved by name) or a directory whose compiled xlr manifest to include. Repeatable. Overrides config.xlr.bundleSources when given.",
      multiple: true,
    }),
    manifestPath: Flags.string({
      description:
        "Path to a source's manifest.json, relative to its resolved root.",
      default: "dist/xlr/manifest.json",
    }),
    output: Flags.string({
      char: "o",
      description: "Output directory to write the collated manifest to.",
      default: "./dist",
    }),
  };

  private async getOptions() {
    const { flags } = await this.parse(XLRBundle);
    const config = await this.getPlayerConfig();

    return {
      sources: flags.source ?? config.xlr?.bundleSources ?? [],
      manifestPath: flags.manifestPath,
      outputDir: path.join(flags.output, "xlr"),
      metaDataBySource: config.xlr?.bundleMetaData,
    };
  }

  async run(): Promise<{
    /** the status code */
    exitCode: number;
  }> {
    const { sources, manifestPath, outputDir, metaDataBySource } =
      await this.getOptions();

    const manifest = bundleManifests(sources, manifestPath, metaDataBySource);
    writeBundledManifest(outputDir, manifest);

    return { exitCode: 0 };
  }
}
