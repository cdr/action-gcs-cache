import * as core from "@actions/core";
import { exec } from "@actions/exec";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

async function run(): Promise<void> {
    try {
        if (utils.isGhes()) {
            utils.logWarning("Cache action is not supported on GHES");
            utils.setCacheHitOutput(false);
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const serviceAccount = core.getInput("gcloud_service_account", {
            required: true
        });
        await exec(
            "gcloud",
            ["auth", "activate-service-account", "--key-file", "-"],
            {
                input: Buffer.from(serviceAccount)
            }
        );

        const primaryKey = core.getInput(Inputs.Key, { required: true });
        core.saveState(State.CachePrimaryKey, primaryKey);

        let exitCode = await exec("gsutil", ["stat", primaryKey]);
        if (exitCode === 1) {
            return core.setFailed("Cache does not exist!");
        }

        const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
        exitCode = await exec("/bin/bash", [
            "-c",
            `gsutil -o 'GSUtil:parallel_thread_count=1' -o 'GSUtil:sliced_object_download_max_components=8' cp "${primaryKey}" - | tar -x -P -C "${workspace}"`
        ]);
        if (exitCode === 1) {
            console.log("[warning]Failed to extract cache...");
            return;
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();

export default run;
