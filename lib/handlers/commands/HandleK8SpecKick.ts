/*
 * Copyright © 2018 Atomist, Inc.
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

import { CommandHandlerRegistration } from "@atomist/sdm";

export interface K8SpecKickParameters {
    message: string;
}

export const K8SpecKick: CommandHandlerRegistration<K8SpecKickParameters> = {
    name: "K8SpecKick",
    description: "kick the service",
    intent: "kick service",
    parameters: {
        message: {
            default: "Kicking the service",
            required: false,
        },
    },
    listener: async cli => {
        return cli.addressChannels(`We're gonna kick it with message \`${cli.parameters.message}\``);
    },
};