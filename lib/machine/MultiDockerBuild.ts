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
    DefaultGoalNameGenerator,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal,
    GoalDefinition,
    GoalInvocation,
    ImplementationRegistration,
    IndependentOfEnvironment,
} from "@atomist/sdm";
import {
    DefaultDockerImageNameCreator,
    DockerImageNameCreator,
    DockerOptions,
    DockerProgressReporter,
    executeDockerBuild,
} from "@atomist/sdm-pack-docker";

/**
 * Registration for a certain docker build and push configuration
 */
export interface MultiDockerBuildRegistration extends Partial<ImplementationRegistration> {
    options: DockerOptions;
    imageNameCreator?: DockerImageNameCreator;
}

/**
 * Goal that performs docker build and push depending on the provided options
 */
export class MultiDockerBuild extends FulfillableGoalWithRegistrations<MultiDockerBuildRegistration[]> {

    constructor(uniqueName: string = DefaultGoalNameGenerator.generateName("docker-build"),
                ...dependsOn: Goal[]) {

        super({
            ...DockerBuildDefinition,
            ...getGoalDefinitionFrom({ uniqueName: "docker-multi-build" }, DefaultGoalNameGenerator.generateName("docker-build")),
        });
    }

    public with(registration: MultiDockerBuildRegistration[]): this {
        this.addFulfillment({
            // Not sure if this is right... think this might be causing the
            // problem. Could we add multipleFulfillments? Is that a thing?
            // if so would be neater than doing this.
            goalExecutor: async (r: GoalInvocation) => {
                // I think this requires more work to collect up responses
                // from the executeDockerBuild function and combine them
                // to create an approprate response for the goalExecturo
                registration.forEach(element => {
                    executeDockerBuild(
                        {
                            ...element.options,
                            dockerImageNameCreator: element.imageNameCreator,
                        },
                    );
                });
            },
            name: DefaultGoalNameGenerator.generateName("docker-builder"),
            progressReporter: DockerProgressReporter,
            // not sure this is actually required but clearly this isn't a great
            // way to do this!
            ...registration[0] as ImplementationRegistration,
        });
        return this;
    }
}

const DockerBuildDefinition: GoalDefinition = {
    uniqueName: "docker-build",
    displayName: "docker build",
    environment: IndependentOfEnvironment,
    workingDescription: "Running docker build",
    completedDescription: "Docker build successful",
    failedDescription: "Docker build failed",
    isolated: true,
    retryFeasible: true,
};
