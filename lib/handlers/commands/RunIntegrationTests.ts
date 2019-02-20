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
    Parameters,
    Secret,
    Secrets,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    LoggingProgressLog,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { runIntegrationTests } from "../../machine/integrationTests";

@Parameters()
export class IntegrationTestParams {

    @Secret(Secrets.userToken("repo"))
    public githubToken: string;

}

export function runIntegrationTestsCommand(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<IntegrationTestParams> {
    return {
        name: "RunIntegrationTests",
        description: "run platform integration tests",
        intent: "testinate",
        paramsMaker: IntegrationTestParams,
        listener: async cli => {
            await cli.addressChannels(`Running integration tests ...`);
            const progressLog = new LoggingProgressLog("console-log");
            const testResult = await runIntegrationTests(
                sdm.configuration,
                {token: cli.parameters.githubToken},
                cli.context,
                progressLog,
            );

            if (testResult.code === 0) {
                await cli.addressChannels(`All tests passed!`);
            } else {
                await cli.addressChannels(`Boo! There were test failures. I wish I could tell you more.`);
            }

        },
    };
}
