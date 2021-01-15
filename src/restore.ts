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
        let cacheKey = `${primaryKey}-${process.env.GITHUB_REF}`;
        // We save the state here... we never wanna overwrite the
        // master cache unless we're on master.
        core.saveState(State.CachePrimaryKey, cacheKey);

        try {
            await exec("gsutil", ["stat", cacheKey], {
                failOnStdErr: false
            });
        } catch (ex) {
            // We try to reference the master cache if it exists.
            cacheKey = `${primaryKey}-refs/heads/master`;

            try {
                await exec("gsutil", ["stat", cacheKey], {
                    failOnStdErr: false
                });
            } catch (ex) {
                return console.log("Cache not found!");
            }
        }

        const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
        const exitCode = await exec("/bin/bash", [
            "-c",
            `gsutil -o 'GSUtil:parallel_thread_count=1' -o 'GSUtil:sliced_object_download_max_components=8' cp "${cacheKey}" - | tar --skip-old-files -x -P -C "${workspace}"`
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
