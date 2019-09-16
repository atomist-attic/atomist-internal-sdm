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
    addressEvent,
    GitHubRepoRef,
    GitProject,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters,
    Project,
    projectUtils,
    Secret,
    Secrets,
    SimpleProjectEditor,
    SuccessPromise,
} from "@atomist/automation-client";

import {
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
} from "@atomist/sdm";
import * as fs from "fs";
import * as _ from "lodash";
import * as dir from "node-dir";
import * as path from "path";
import { PodDeployments } from "../typings/types";
import { fetchDockerImage } from "./events/HandleRunningPods";
import { rwlcVersion } from "./release";

function filesAsync(dirName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        dir.files(dirName, (err, files) => {
            if (err !== null) {
                return reject(err);
            }
            resolve(files);
        });
    });
}

function readFileAsync(fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, (err, c) => {
            if (err !== null) {
                return reject(err);
            }
            resolve(c.toString());
        });
    });
}

export async function addCacheHooks(p: Project): Promise<Project> {
    const dotAtomist = path.join(fs.realpathSync(__dirname), "../resources/dot-atomist");
    const files = await filesAsync(dotAtomist);
    await Promise.all(_.map(files, async file => {
        const target = path.join(".atomist/", path.relative(dotAtomist, file));
        if (!p.fileExistsSync(target)) {
            const content = await readFileAsync(file);
            logger.info(`Copying file ${file} -> ${target}`);
            await p.addFile(target, content);
            return p.makeExecutable(target);
        } else {
            return Promise.resolve(); // this is silly. Checking gone mad!
        }
    }));
    logger.info("Finished copying .atomist files");
    return p;
}

@Parameters()
export class K8SpecUpdaterParameters {
    @Parameter({ required: true, pattern: /prod|staging/, validInput: "prod | staging" })
    public readonly env: string;
    @Parameter({ required: true, pattern: /.*/ })
    public readonly version: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public readonly owner: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public readonly repo: string;

    @Secret(Secrets.userToken("repo"))
    public readonly token: string;
}

/**
 * Update all Deployments that contain the mapping
 * @param owner
 * @param repo
 * @param version
 * @param project
 */
export const updateK8Spec: SimpleProjectEditor = async (project: Project, ctx: HandlerContext, params: any): Promise<Project> => {

    const owner = params.owner;
    const repo = params.repo;
    const version = params.version;

    return projectUtils.doWithFiles(project, "**/*.json", async f => {
        logger.info("Processing file: " + f.path);
        const spec = JSON.parse(await f.getContent());
        let dirty = false;
        if (spec.kind === "Deployment") {
            const template = spec.spec.template;
            const annotations = template.metadata.annotations;
            if (annotations) {
                const updater = annotations["atomist.updater"] as string;
                if (updater) {
                    logger.info("Found updater config" + updater);
                    const mapping = updater.replace("{", "").replace("}", "").split(" ");
                    const keys = _.filter(mapping, (value, idx) => idx % 2 === 1);
                    const images = _.filter(mapping, (value, idx) => idx % 2 === 0);
                    const dirtyImages: Array<{ previousImage: string, currentImage: string }> = [];
                    if (keys.includes(`${owner}/${repo}`)) {
                        spec.spec.template.spec.containers = _.reduce(
                            spec.spec.template.spec.containers, (acc, container) => {
                                const repoWithName = container.image.split(":")[0];
                                if (images.includes(mapping[0])) {
                                    const nv = container.image.split("/")[1].split(":");
                                    if (nv[1] !== version) {
                                        dirty = true;
                                        const newImage = `${repoWithName}:${version}`;
                                        dirtyImages.push({
                                            previousImage: container.image,
                                            currentImage: newImage,
                                        });
                                        container.image = newImage;
                                    }
                                }
                                acc.push(container);
                                return acc;
                            }, []);
                    }
                    if (dirty) {
                        logger.info("Spec updated, writing to " + f.path);
                        await f.setContent(JSON.stringify(spec, undefined, 2));
                        // send custom event to record deployment target
                        await Promise.all(dirtyImages.map(async dirtyImage => {
                            const previousSha = (await fetchDockerImage(ctx, dirtyImage.previousImage))[0].commits[0].sha;
                            const currentImage = (await fetchDockerImage(ctx, dirtyImage.currentImage));
                            if (currentImage && currentImage.length > 0 && currentImage[0].commits && currentImage[0].commits.length > 0) {
                                const currentSha = currentImage[0].commits[0].sha;
                                let targetReplicas = spec.spec.replicas;
                                if (params.branch === "prod" && f.path.indexOf("/us-east1") <= 0) {
                                    targetReplicas = targetReplicas * 3;
                                }
                                const target: PodDeployments.PodDeployment = {
                                    deploymentName: spec.metadata.name as string,
                                    imageTag: dirtyImage.currentImage,
                                    targetReplicas,
                                    sha: currentSha,
                                    previousSha,
                                    environment: params.branch,
                                    timestamp: Date.now(),
                                };
                                await ctx.messageClient.send(target, addressEvent("PodDeployment"));
                            }

                            logger.info("Spec written " + f.path);

                        }));
                    }
                }
            }

        }
        if (dirty) {
            logger.info(`Updated ${owner}/${repo} to ${version} in ${f.path}`);
        }
    });

};

export function k8SpecUpdater(env: string): ExecuteGoal {
    return async (rwlc: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { credentials, id, configuration } = rwlc;
        const version = await rwlcVersion(rwlc);
        const repo = `k8s-internal-${env}-specs`;
        return configuration.sdm.projectLoader.doWithProject({
            credentials,
            id: GitHubRepoRef.from({ owner: "atomisthq", repo, branch: "master" }),
            readOnly: false,
            context: rwlc.context,
            cloneOptions: {
                alwaysDeep: true,
            },
        },
            async (project: GitProject) => {
                await updateK8Spec(project, rwlc.context, { owner: id.owner, repo: id.repo, version, branch: env });
                await project.commit(`Update ${id.owner}/${id.repo} to ${version}`);
                await project.push();
                return SuccessPromise;
            },
        );
    };
}
