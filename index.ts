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

import { GitHubRepoRef, GitProject, GraphQL } from "@atomist/automation-client";
import { configureDashboardNotifications } from "@atomist/automation-client-ext-dashboard";
import { configureHumio } from "@atomist/automation-client-ext-humio";
import { configureLogzio } from "@atomist/automation-client-ext-logzio";
import { K8sContainerEnvAspect } from "@atomist/k8s-container-envs/lib/k8sContainers";
import {
    allSatisfied,
    and,
    ApproveGoalIfErrorComments,
    ApproveGoalIfWarnComments,
    CloningProjectLoader,
    HasTravisFile,
    MockGoalSize,
    not,
    ToDefaultBranch } from "@atomist/sdm";
import {
    configure,
    DisableDeploy,
    EnableDeploy,
    executeVersioner,
    githubGoalStatusSupport,
    goalStateSupport,
    k8sGoalSchedulingSupport,
} from "@atomist/sdm-core";
import { CljFunctions, IsLein, leinSupport, Logback, MaterialChangeToClojureRepo, Metajar } from "@atomist/sdm-pack-clojure";
import {
    leinBuild, publish,
} from "@atomist/sdm-pack-clojure/lib/machine/goals";
import { DefaultDockerImageNameCreator } from "@atomist/sdm-pack-docker";
import { fingerprintSupport } from "@atomist/sdm-pack-fingerprint";
import { singleIssuePerCategoryManaging } from "@atomist/sdm-pack-issue";
import { K8SpecKick } from "./lib/handlers/commands/HandleK8SpecKick";
import { MakeSomePushes } from "./lib/handlers/commands/MakeSomePushes";
import { runIntegrationTestsCommand } from "./lib/handlers/commands/RunIntegrationTests";
import { handleRunningPods } from "./lib/machine/events/HandleRunningPods";
import {
    autoCodeInspection,
    autofix,
    deployToProd,
    deployToStaging,
    dockerBuild,
    integrationTest,
    neoApolloDockerBuild,
    nodeVersion,
    tag,
    updateProdK8Specs,
    updateStagingK8Specs,
    version } from "./lib/machine/goals";
import { goalRunIntegrationTests } from "./lib/machine/integrationTests";
import { addCacheHooks, k8SpecUpdater, K8SpecUpdaterParameters, updateK8Spec } from "./lib/machine/k8Support";
import {
    apolloImageNamer,
    AutoApproveEditModeMaker,
    FingerprintGoal,
    HasAtomistDockerfile,
    HasAtomistFile,
    HasIntegrationTestMarkerFile,
    HasNeoApolloDockerfile,
    IsWorkspaceWhitelisted,
    NodeProjectVersioner} from "./lib/machine/machine";

export const configuration = configure(async sdm => {

    sdm.configuration.logging = {
        level: "debug",
    };

    sdm.configuration.sdm = {
        build: {
            tag: false,
        },
        npm: {
            publish: {
                tag: {
                    defaultBranch: true,
                },
            },
        },
        mock: {
            enabled: goal => goal.push.after.message.includes("[sdm:mock]"),
            defaultSize: MockGoalSize.Small,
            goals: [{
                goal: leinBuild,
                size: MockGoalSize.Medium,
            }],
        },
    };

    sdm.configuration.postProcessors = [
        configureLogzio,
        configureHumio,
        configureDashboardNotifications,
    ];

    sdm.addExtensionPacks(
        leinSupport({
            autofixGoal: autofix,
            inspectGoal: autoCodeInspection,
            version,
        }),
        k8sGoalSchedulingSupport(),
        goalStateSupport(),
        githubGoalStatusSupport(),
        fingerprintSupport({
            pushImpactGoal: FingerprintGoal,
            aspects: [
                K8sContainerEnvAspect,
                Logback,
                CljFunctions,
            ],
            transformPresentation: AutoApproveEditModeMaker,
        }),
    );

    autoCodeInspection
        .withListener(ApproveGoalIfErrorComments)
        .withListener(ApproveGoalIfWarnComments)
        .withListener(singleIssuePerCategoryManaging(sdm.configuration.name, true, () => true));

    sdm.addCommand(DisableDeploy);
    sdm.addCommand(EnableDeploy);
    sdm.addCommand(K8SpecKick);

    sdm.addIngester(GraphQL.ingester("podDeployments"));

    autofix.with(
        {
            name: "maven-repo-cache",
            transform: addCacheHooks,
            pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
        },
    );

    updateStagingK8Specs.with({
        name: "update-staging-k8-specs",
        goalExecutor: k8SpecUpdater("staging"),
    });

    updateProdK8Specs.with({
        name: "update-prod-k8-specs",
        goalExecutor: k8SpecUpdater("production"),
    });

    nodeVersion.with({
        name: "update-version",
        goalExecutor: executeVersioner(NodeProjectVersioner),
    });

    dockerBuild.with(
        {
            dockerImageNameCreator: DefaultDockerImageNameCreator,
            dockerfileFinder: async () => "docker/Dockerfile",
            push: true,
            registry: {
                ...sdm.configuration.sdm.docker.jfrog,
            },
        },
    ).withProjectListener(Metajar);

    neoApolloDockerBuild.with(
        {
            // note that I've just made this public locally for the moment
            dockerImageNameCreator: apolloImageNamer,
            dockerfileFinder: async () => "apollo/Dockerfile",
            push: true,
            registry: {
                ...sdm.configuration.sdm.docker.jfrog,
            },
        },
    );

    integrationTest.with({
        name: "integrationTest",
        goalExecutor: goalRunIntegrationTests,
    });

    deployToStaging.with({
        name: "deployToStaging",
        pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
    });

    deployToProd.with({
        name: "deployToProd",
        pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
    });

    sdm.addEvent({
        name: "handleRunningPod",
        description: "Update goal based on running pods in an environemnt",
        subscription: GraphQL.subscription("runningPods"),
        listener: handleRunningPods(),
    });

    sdm.addCommand<K8SpecUpdaterParameters>({
        name: "k8SpecUpdater",
        description: "Update k8 specs",
        intent: "update spec",
        paramsMaker: K8SpecUpdaterParameters,
        listener: async cli => {

            return CloningProjectLoader.doWithProject({
                credentials: { token: cli.parameters.token },
                id: GitHubRepoRef.from({ owner: "atomisthq", repo: "atomist-k8-specs", branch: cli.parameters.env }),
                readOnly: false,
                context: cli.context,
                cloneOptions: {
                    alwaysDeep: true,
                },
            },
                async (prj: GitProject) => {
                    const result = await updateK8Spec(prj, cli.context, {
                        owner: cli.parameters.owner,
                        repo: cli.parameters.repo,
                        version: cli.parameters.version,
                        branch: cli.parameters.env,
                    });
                    await prj.commit(`Update ${cli.parameters.owner}/${cli.parameters.repo} to ${cli.parameters.version}`);
                    await prj.push();
                    return result;
                },
            );
        },
    });

    sdm.addCommand(runIntegrationTestsCommand(sdm));
    sdm.addCommand(MakeSomePushes);

    return {
        fingerprint: {
            test: and( IsLein, IsWorkspaceWhitelisted),
            goals: [FingerprintGoal],
        },
        autofix: {
            test: and(IsLein, MaterialChangeToClojureRepo),
            goals: [autofix],
        },
        check: {
            test: and(IsLein, MaterialChangeToClojureRepo),
            goals: [version, autoCodeInspection],
            dependsOn: "autofix",
        },
        build: {
            test: and(IsLein, MaterialChangeToClojureRepo, HasAtomistFile),
            goals: [leinBuild],
            dependsOn: "check",
        },
        dockerBuild: {
            test: HasAtomistDockerfile,
            goals: [dockerBuild],
            dependsOn: "build",
        },
        neoApolloDockerBuild: {
            test: HasNeoApolloDockerfile,
            goals: [neoApolloDockerBuild],
            dependsOn: "build",
        },
        tag: {
            test: and(IsLein, MaterialChangeToClojureRepo),
            goals: [tag],
            dependsOn: "dockerBuild",
        },
        publish: {
            test: and(IsLein, MaterialChangeToClojureRepo),
            goals: [publish],
            dependsOn: "tag",
        },
        updateStagingK8Specs: {
            test: ToDefaultBranch,
            goals: [updateStagingK8Specs],
            dependsOn: "tag",
        },
        updateProdK8Specs: {
            test: ToDefaultBranch,
            goals: [updateProdK8Specs],
            dependsOn: "deployToStaging",
        },
        deployToStaging: {
            test: ToDefaultBranch,
            goals: [updateProdK8Specs],
            dependsOn: "updateStagingK8Specs",
        },
        integrationTest: {
            test: and( HasIntegrationTestMarkerFile, ToDefaultBranch),
            goals: [integrationTest],
            dependsOn: "deployToStaging",
        },
        deployToProd: {
            test: ToDefaultBranch,
            goals: [deployToProd],
            dependsOn: "updateProdK8Specs",
        },
    };
},
{
    name: "Atomist Software Delivery Machine",
    requiredConfigurationValues: [
        "sdm.npm.npmrc",
        "sdm.npm.registry",
        "sdm.npm.access",
        "sdm.docker.jfrog.registry",
        "sdm.docker.jfrog.user",
        "sdm.docker.jfrog.password",
    ],
});
