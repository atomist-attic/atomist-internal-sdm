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

import {
    EventFired,
    GitHubRepoRef,
    HandlerContext,
    logger,
    NoParameters,
    OnEvent,
    Success,
} from "@atomist/automation-client";
import {
    findSdmGoalOnCommit,
    SdmGoalEvent,
    SdmGoalState,
    updateGoal,
} from "@atomist/sdm";
import {
    FetchDockerImage,
    PodDeployments,
    RunningPods,
} from "../../typings/types";
import {
    deployToProd,
    deployToStaging,
} from "../goals";

async function getGoal(pod: RunningPods.K8Pod, context: HandlerContext): Promise<[SdmGoalEvent, string]> {
    const commit = pod.containers[0].image.commits[0];
    const id = new GitHubRepoRef(commit.repo.owner, commit.repo.name, commit.sha);

    if (pod.environment === "gke-int-production") {
        if (pod.namespace === "api-staging") {
            try {
                return [
                    await findSdmGoalOnCommit(context, id, commit.repo.org.provider.providerId, deployToStaging),
                    deployToStaging.successDescription,
                ];
            } catch (err) {
                logger.info(`No goal staging deploy goal found`);
            }
        } else if (pod.namespace === "api-production") {
            try {
                return [
                    await findSdmGoalOnCommit(context, id, commit.repo.org.provider.providerId, deployToProd),
                    deployToProd.successDescription,
                ];
            } catch (err) {
                logger.info(`No goal prod deploy goal found`);
            }
        }
    }
    return undefined;
}

export function handleRuningPods(): OnEvent<RunningPods.Subscription, NoParameters> {
    return async (e: EventFired<RunningPods.Subscription>, context: HandlerContext) => {

        const pod = e.data.K8Pod[0];
        const[deployGoal, desc]: [SdmGoalEvent, string] = await getGoal(pod, context);

        if (deployGoal && desc) {

            // grab deploymentStarted event
            const targetDeployments = await fetchDeploymentTarget(context, pod);

            if (targetDeployments && targetDeployments.length >= 1) {
                const numCurrentPods = pod.containers[0].image.pods.filter(deployedPod => {
                    return pod.environment = deployedPod.environment;
                }).length;
                const numTargetPods = targetDeployments[0].targetReplicas;
                logger.info(`Pods: ${numCurrentPods} / ${numTargetPods}`);
                if (numCurrentPods >= numTargetPods) {
                    // then we know we have a successful deployment
                    // need to find commits between current and previous!
                    await updateGoal(context, deployGoal, {
                        state: SdmGoalState.success,
                        description: desc + ` (${numTargetPods}/${numTargetPods})`,
                        url: deployGoal.url,
                    });
                } else {
                    await updateGoal(context, deployGoal, {
                        state: SdmGoalState.in_process,
                        description: desc + ` (${numCurrentPods}/${numTargetPods})`,
                        url: deployGoal.url,
                    });
                }
            } else {
                await updateGoal(context, deployGoal, {
                    state: SdmGoalState.success,
                    description: desc,
                    url: deployGoal.url,
                });
            }

            logger.info("Updated deploy goal '%s'", deployGoal.name);
        }

        return Success;
    };
}

export async function fetchDockerImage(ctx: HandlerContext, imageTag: string): Promise<FetchDockerImage.DockerImage[]> {
    logger.info(`Fetching docker images with tag ${imageTag}`);
    const images = await ctx.graphClient.query<FetchDockerImage.Query, FetchDockerImage.Variables>(
        {
            name: "fetchDockerImage",
            variables:
                {
                    imageName: imageTag,
                },
        });
    logger.info(`Found Docker images with tag ${imageTag}: ${JSON.stringify(images)}`);
    return images.DockerImage;
}

async function fetchDeploymentTarget(ctx: HandlerContext, pod: RunningPods.K8Pod): Promise<PodDeployments.PodDeployment[]> {
    const deps = await ctx.graphClient.query<PodDeployments.Query, PodDeployments.Variables>(
        {
            name: "podDeployments",
            variables: {
                env: pod.environment,
                sha: pod.containers[0].image.commits[0].sha,
                imageTag: pod.containers[0].imageName,
            },
        });
    logger.info(`Found PodDeployments: ${JSON.stringify(deps)}`);
    return deps.PodDeployment;
}
