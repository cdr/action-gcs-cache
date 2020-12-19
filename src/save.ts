import * as cache from "@actions/cache";
import * as cacheUtils from "@actions/cache/lib/internal/cacheUtils";
import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { writeFileSync } from "fs";
import * as path from "path";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

async function run(): Promise<void> {
    try {
        if (utils.isGhes()) {
            utils.logWarning("Cache action is not supported on GHES");
            return;
        }

        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const primaryKey = core.getState(State.CachePrimaryKey);
        const paths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });

        // https://github.com/actions/toolkit/blob/c861dd8859fe5294289fcada363ce9bc71e9d260/packages/cache/src/internal/tar.ts#L75
        const cachePaths = await cacheUtils.resolvePaths(paths);
        const tmpFolder = await cacheUtils.createTempDirectory();
        // Write source directories to manifest.txt to avoid command length limits
        const manifestPath = path.join(tmpFolder, "manifest.txt");
        writeFileSync(manifestPath, cachePaths.join("\n"));

        const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
        const exitCode = await exec("/bin/bash", [
            "-c",
            `tar -cf - -P -C ${workspace} --files-from ${manifestPath} | gsutil -o 'GSUtil:parallel_composite_upload_threshold=250M' cp - "${primaryKey}"`
        ]);
        if (exitCode === 1) {
            utils.logWarning("Failed to upload cache...");
        }
    } catch (error) {
        utils.logWarning(error.message);
    }
}

run();

export default run;
