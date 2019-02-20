/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GitHubRepoRef,
    GitProject,
    HandlerContext,
    HandlerResult,
    ProjectOperationCredentials,
} from "@atomist/automation-client";
import {
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
    SoftwareDeliveryMachineConfiguration,
    spawnPromise,
    ProgressLog,
} from "@atomist/sdm";
import { enrich } from "@atomist/sdm-pack-clojure/lib/machine/leinSupport";

export async function runIntegrationTests(
    configuration: SoftwareDeliveryMachineConfiguration,
    credentials: ProjectOperationCredentials,
    context: HandlerContext,
    progressLog: ProgressLog): Promise<HandlerResult> {

    return configuration.sdm.projectLoader.doWithProject({

        id: GitHubRepoRef.from({owner: "atomisthq", repo: "org-service"}),
        credentials,
        context,
        readOnly: true,

    }, async (project: GitProject) => {
        const spawnOptions = await enrich({}, project);
        const result = await spawnPromise(
            "./integration.sh", [], {
                env: spawnOptions.env,
                cwd: project.baseDir,
            });
        progressLog.write(result.stdout);
        progressLog.write(result.stderr);
        return {code: result.status};
    });
}

export function goalRunIntegrationTests(): ExecuteGoal {
    return async (rwlc: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { configuration, credentials, context, progressLog } = rwlc;
        return runIntegrationTests(configuration, credentials, context, progressLog);
    };
}
