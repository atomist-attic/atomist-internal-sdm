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
    GitHubRepoRef,
    GitProject,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Parameters, Project, projectUtils, Secret, Secrets,
    SimpleProjectEditor,
} from "@atomist/automation-client";
import { CloningProjectLoader, CommandHandlerRegistration } from "@atomist/sdm";
import _ = require("lodash");

@Parameters()
export class MakeSomePushesParams {
    @Parameter({
        required: false,
        description: "Comma separated list of repos",
    })
    public repos: string = "pochta, automation-api, bruce, incoming-webhooks, org-service";

    @MappedParameter(MappedParameters.GitHubOwner)
    public readonly owner: string;

    @Secret(Secrets.userToken("repo"))
    public readonly token: string;
}

export const MakeSomePushes: CommandHandlerRegistration<MakeSomePushesParams> = {
    name: "MakeSomePushes",
    description: "make some random pushes to start sdms",
    intent: "make some pushes",
    paramsMaker: MakeSomePushesParams,
    listener: async cli => {
        const repos = _.map(cli.parameters.repos.split(","), repo => repo.trim());
        repos.forEach(repo => {
            return CloningProjectLoader.doWithProject({
                credentials: { token: cli.parameters.token },
                id: GitHubRepoRef.from({ owner: cli.parameters.owner, repo, branch: "master" }),
                readOnly: false,
                context: cli.context,
                cloneOptions: {
                    alwaysDeep: true,
                },
            },
                async (prj: GitProject) => {
                    const result = await simpleChange(prj, cli.context);
                    await prj.commit(`Add whitespace to project.clj`);
                    await prj.push();
                    return result;
                },
            );
        });
        return cli.addressChannels(`We're gonna make commits to \`${cli.parameters.repos}\``);
    },
};

export const simpleChange: SimpleProjectEditor = async (project: Project, ctx: HandlerContext, params: any): Promise<Project> => {
    return projectUtils.doWithFiles(project, "project.clj", async f => {
        logger.info("Processing file: " + f.path);
        const clj = await f.getContent();
        await f.setContent(clj + "\n\n\n\n");
    });
};
