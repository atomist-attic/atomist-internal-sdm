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

/* tslint:disable:max-file-line-count */

import {
    editModes,
    GitHubRepoRef,
    GitProject,
    GraphQL,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import {
    AutoMergeMethod,
    AutoMergeMode,
} from "@atomist/automation-client/lib/operations/edit/editModes";
import * as clj from "@atomist/clj-editors";
import { K8sContainerEnvAspect } from "@atomist/k8s-container-envs/lib/k8sContainers";
import {
    allSatisfied,
    ApproveGoalIfErrorComments,
    ApproveGoalIfWarnComments,
    CloningProjectLoader,
    goals,
    hasFile,
    ImmaterialGoals,
    isSdmEnabled,
    not,
    predicatePushTest,
    PredicatePushTest,
    PushImpact,
    pushTest,
    PushTest,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    spawnLog,
    ToDefaultBranch,
    TransformPresentation,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    DisableDeploy,
    EnableDeploy,
    executeVersioner,
    githubGoalStatusSupport,
    goalStateSupport,
    k8sGoalSchedulingSupport,
    ProjectVersioner,
    readSdmVersion,
} from "@atomist/sdm-core";
import {
    CljFunctions,
    IsLein,
    leinSupport,
    Logback,
    MaterialChangeToClojureRepo,
    Metajar,
} from "@atomist/sdm-pack-clojure";
import {
    DefaultDockerImageNameCreator,
    DockerImageNameCreator,
    DockerOptions,
} from "@atomist/sdm-pack-docker";
import { fingerprintSupport } from "@atomist/sdm-pack-fingerprint";
import { ApplyTargetParameters } from "@atomist/sdm-pack-fingerprint/lib/handlers/commands/applyFingerprint";
import { singleIssuePerCategoryManaging } from "@atomist/sdm-pack-issue";
import { IsNode } from "@atomist/sdm-pack-node";
import { HasTravisFile } from "@atomist/sdm/lib/api-helper/pushtest/ci/ciPushTests";
import * as df from "dateformat";
import * as _ from "lodash";
import * as path from "path";
import { K8SpecKick } from "../handlers/commands/HandleK8SpecKick";
import { MakeSomePushes } from "../handlers/commands/MakeSomePushes";
import { runIntegrationTestsCommand } from "../handlers/commands/RunIntegrationTests";
import { handleRunningPods } from "./events/HandleRunningPods";
import {
    autoCodeInspection,
    autofix,
    deployToProd,
    deployToStaging,
    dockerBuild,
    integrationTest,
    LeinAndNodeDockerGoals,
    LeinBuildGoals,
    LeinDefaultBranchBuildGoals,
    LeinDefaultBranchDockerGoals,
    LeinDefaultBranchIntegrationTestDockerGoals,
    LeinDockerGoals,
    neoApolloDockerBuild,
    nodeVersion,
    updateProdK8Specs,
    updateStagingK8Specs,
    version,
} from "./goals";
import { goalRunIntegrationTests } from "./integrationTests";
import {
    addCacheHooks,
    k8SpecUpdater,
    K8SpecUpdaterParameters,
    updateK8Spec,
} from "./k8Support";

export const NodeProjectVersioner: ProjectVersioner = async (sdmGoal, p, log) => {
    const pjFile = await p.getFile("package.json");
    const pj = JSON.parse(await pjFile.getContent());
    const branch = sdmGoal.branch.split("/").join(".");

    let branchSuffix = "";
    if (branch !== "master") {
        branchSuffix = "master.";
    }

    const newVersion = `${pj.version}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;

    await spawnLog(
        "npm",
        ["--no-git-tag-version", "version", newVersion],
        {
            log,
        },
    );

    return newVersion;
};

export const HasAtomistFile: PredicatePushTest = predicatePushTest(
    "Has Atomist file",
    hasFile("atomist.sh").predicate);

export const HasAtomistDockerfile: PredicatePushTest = predicatePushTest(
    "Has Atomist Dockerfile file",
    hasFile("docker/Dockerfile").predicate);

const HasIntegrationTestMarkerFile: PredicatePushTest = predicatePushTest(
    "Has marker file to run integration tests",
    hasFile("requires-integration-test").predicate);

const HasNeoApolloDockerfile: PredicatePushTest = predicatePushTest(
    "Has an apollo Dockerfile file",
    hasFile("apollo/Dockerfile").predicate);

export const FingerprintGoal = new PushImpact();

const AtomistWorkspaces = "T095SFFBK,AK748NQC5";
const WorkspacesFilename = "workspaces";

const IsWorkspaceWhitelisted: PushTest =
    pushTest(`project has workspaces file that contains the current workspace id`,
        async pci => {
            const file = await pci.project.getFile(WorkspacesFilename);
            // we pretend that all projects by default have a file white-listing AtomistHQ
            let fileContent = AtomistWorkspaces;
            if (file) {
                fileContent = await file.getContent();
            }
            return fileContent.includes(pci.context.workspaceId);
        },
    );

export const AutoApproveEditModeMaker: TransformPresentation<ApplyTargetParameters> = (ci, p) => {
    // name the branch apply-target-fingerprint with a Date
    // title can be derived from ApplyTargetParameters
    // body can be derived from ApplyTargetParameters
    // optional message is undefined here
    // target branch is hard-coded to master
    return new editModes.PullRequest(
        `apply-target-fingerprint-${Date.now()}`,
        `${ci.parameters.title}`,
        `> generated by Atomist \`\`\`${ci.parameters.body}\`\`\``,
        undefined,
        ci.parameters.branch || "master",
        {
            method: AutoMergeMethod.Squash,
            mode: AutoMergeMode.SuccessfulCheck,
        });
};

export function machine(configuration: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {
    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Software Delivery Machine",
        configuration,
    },

        whenPushSatisfies(not(IsWorkspaceWhitelisted))
            .setGoals(goals("no goals")),

        whenPushSatisfies(not(isSdmEnabled(configuration.name)), IsNode, not(IsLein))
            .itMeans("Default to not build Node.js projects unless they are cljs ones")
            .setGoals(goals("no goals")),

        whenPushSatisfies(IsLein, not(HasTravisFile), not(MaterialChangeToClojureRepo))
            .itMeans("No material change")
            .setGoals(ImmaterialGoals),

        whenPushSatisfies(IsLein, HasAtomistFile, HasAtomistDockerfile, HasNeoApolloDockerfile, ToDefaultBranch)
            .itMeans("Build project with lein and npm parts")
            .setGoals(goals("lein and npm project").plan(LeinAndNodeDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, HasAtomistDockerfile, not(HasIntegrationTestMarkerFile),
            ToDefaultBranch, MaterialChangeToClojureRepo, not(HasNeoApolloDockerfile))
            .itMeans("Build a Clojure Service with Leiningen")
            .setGoals(goals("service with fingerprints on master").plan(LeinDefaultBranchDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, HasAtomistDockerfile, HasIntegrationTestMarkerFile,
            ToDefaultBranch, MaterialChangeToClojureRepo, not(HasNeoApolloDockerfile))
            .itMeans("Build a Clojure Service with Leiningen, and run integration tests")
            .setGoals(goals("service with integration tests and fingerprints on master")
                .plan(LeinDefaultBranchIntegrationTestDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, HasAtomistDockerfile, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Service with Leiningen")
            .setGoals(goals("service with fingerprints").plan(LeinDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, not(HasAtomistDockerfile), ToDefaultBranch, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Library with Leiningen (default branch)")
            .setGoals(goals("library on master with fingerprints").plan(LeinDefaultBranchBuildGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, not(HasAtomistDockerfile), MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Library with Leiningen")
            .setGoals(goals("library").plan(LeinBuildGoals, FingerprintGoal)),
    );

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

    return sdm;
}

export const apolloImageNamer: DockerImageNameCreator =
    async (
        p: GitProject,
        sdmGoal: SdmGoalEvent,
        options: DockerOptions,
        ctx: HandlerContext) => {

        const projectclj = path.join(p.baseDir, "project.clj");
        const newversion = await readSdmVersion(
            sdmGoal.repo.owner,
            sdmGoal.repo.name,
            sdmGoal.repo.providerId,
            sdmGoal.sha,
            sdmGoal.branch,
            ctx);
        const projectName = _.last(clj.getName(projectclj).split("/"));

        logger.info(`Docker Image name is generated from ${projectclj} name and version ${projectName} ${newversion}`);

        return [{
            name: `${projectName}-apollo`,
            registry: Array.isArray(options.registry) ? options.registry[0].registry : options.registry.registry,
            tags: [newversion],
        }];
    };
