load("@bazel_skylib//rules:expand_template.bzl", "expand_template")

COMMON_TEST_DEPS = [
    "//:node_modules/dlv",
    "//:vitest_config"
]

def tsup_config(name):
    prefix = "../" * len(native.package_name().split("/"))

    expand_template(
        name = name,
        out = "tsup.config.ts",
        substitutions = {
            "%PREFIX%": prefix,
        },
        template = "//helpers:tsup.config.ts.tmpl",
    )

def vitest_config(name):
    prefix = "../" * len(native.package_name().split("/"))

    expand_template(
        name = name,
        out = "vitest.config.mts",
        substitutions = {
            "%PREFIX%": prefix,
        },
        template = "//helpers:vitest.config.mts.tmpl",
    )