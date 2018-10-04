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
    GraphQL,
    spawnAndWatch,
} from "@atomist/automation-client";
import {
    allSatisfied,
    CloningProjectLoader,
    DoNotSetAnyGoals,
    Fingerprint,
    goals,
    hasFile,
    isSdmEnabled,
    not,
    predicatePushTest,
    PredicatePushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    ToDefaultBranch,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    DisableDeploy,
    EnableDeploy,
    executeTag,
    executeVersioner,
    GoalState,
    ProjectVersioner,
    summarizeGoalsInGitHubStatus,
} from "@atomist/sdm-core";

import {
    IsLein,
    LeinBuildGoals,
    LeinDefaultBranchBuildGoals,
    LeinDockerGoals,
    LeinSupport,
    MaterialChangeToClojureRepo,
} from "@atomist/sdm-pack-clojure";
import {
    fingerprintSupport,
    forFingerprints,
    renderDiffSnippet,
} from "@atomist/sdm-pack-fingerprints";
import { RccaSupport } from "@atomist/sdm-pack-rcca";
import { HasTravisFile } from "@atomist/sdm/lib/api-helper/pushtest/ci/ciPushTests";
import {
    NoGoals,
    TagGoal,
} from "@atomist/sdm/lib/pack/well-known-goals/commonGoals";
import { handleRuningPods } from "./events/HandleRunningPods";
import { BranchNodeServiceGoals, dockerBuildGoal } from "./goals";
import {
    DeployToProd,
    DeployToStaging,
    LeinDefaultBranchDockerGoals,
    NodeServiceGoals,
    NodeVersionGoal,
    UpdateProdK8SpecsGoal,
    UpdateStagingK8SpecsGoal,
} from "./goals";
import {
    addCacheHooks,
    k8SpecUpdater,
    K8SpecUpdaterParameters,
    updateK8Spec,
} from "./k8Support";

import { renderData } from "@atomist/clj-editors";
import {
    DefaultDockerImageNameCreator,
    DockerOptions,
    HasDockerfile,
} from "@atomist/sdm-pack-docker";
import {
    IsNode,
    NpmPreparations,
} from "@atomist/sdm-pack-node";

import * as df from "dateformat";
import { K8SpecKick } from "../handlers/commands/HandleK8SpecKick";

export const NodeProjectVersioner: ProjectVersioner = async (sdmGoal, p, log) => {
    const pjFile = await p.getFile("package.json");
    const pj = JSON.parse(await pjFile.getContent());
    const branch = sdmGoal.branch.split("/").join(".");

    let branchSuffix = "";
    if (branch !== "master") {
        branchSuffix = "master.";
    }

    const version = `${pj.version}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;

    await spawnAndWatch({
        command: "npm",
        args: ["--no-git-tag-version", "version", version],
    },
        {
            cwd: p.baseDir,
        },
        log,
        {
            errorFinder: code => code !== 0,
        });

    return version;
};

export const HasAtomistFile: PredicatePushTest = predicatePushTest(
    "Has Atomist file",
    hasFile("atomist.sh").predicate);

export const HasAtomistDockerfile: PredicatePushTest = predicatePushTest(
    "Has Atomist Dockerfile file",
    hasFile("docker/Dockerfile").predicate);

export const FingerprintGoal = new Fingerprint();

export function machine(configuration: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {
    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Software Delivery Machine",
        configuration,
    },

        whenPushSatisfies(not(isSdmEnabled(configuration.name)), IsNode)
            .itMeans("Default to not build Node.js projects")
            .setGoals(DoNotSetAnyGoals),

        whenPushSatisfies(IsLein, not(HasTravisFile), not(MaterialChangeToClojureRepo))
            .itMeans("No material change")
            .setGoals(NoGoals),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, HasAtomistDockerfile, ToDefaultBranch, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Service with Leiningen")
            .setGoals(goals("service with fingerprints on master").plan(LeinDefaultBranchDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, HasAtomistDockerfile, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Service with Leiningen")
            .setGoals(goals("service with fingerprints").plan(LeinDockerGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, not(HasAtomistDockerfile), ToDefaultBranch, MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Library with Leiningen")
            .setGoals(goals("library on master with fingerprints").plan(LeinDefaultBranchBuildGoals, FingerprintGoal)),

        whenPushSatisfies(IsLein, not(HasTravisFile), HasAtomistFile, not(HasAtomistDockerfile), MaterialChangeToClojureRepo)
            .itMeans("Build a Clojure Library with Leiningen")
            .setGoals(goals("library with fingerprints").plan(LeinBuildGoals, FingerprintGoal)),

        whenPushSatisfies(not(IsLein), not(HasTravisFile), HasDockerfile, IsNode, ToDefaultBranch)
            .itMeans("Simple node based docker service")
            .setGoals(goals("simple node service").plan(NodeServiceGoals)),

        whenPushSatisfies(not(IsLein), not(HasTravisFile), HasDockerfile, IsNode, not(ToDefaultBranch))
            .itMeans("Simple node based docker service")
            .setGoals(goals("simple node service").plan(BranchNodeServiceGoals)),

    );

    sdm.addExtensionPacks(
        LeinSupport,
        fingerprintSupport(
            FingerprintGoal,
            {
                selector: forFingerprints(
                    "clojure-project-deps",
                    "npm-project-deps"),
                diffHandler: renderDiffSnippet,
            },
            {
                selector: forFingerprints(
                    "clojure-project-coordinates",
                    "npm-project-coordinates"),
                diffHandler: (ctx, diff) => {
                    return ctx.messageClient.addressChannels(
                        `change in ${diff.from.name} project coords ${renderData(diff.data)}`,
                        diff.channel);
                },
            },
        ),
        RccaSupport,
        GoalState,
    );

    sdm.addCommand(DisableDeploy);
    sdm.addCommand(EnableDeploy);
    sdm.addCommand(K8SpecKick);

    sdm.addGoalImplementation("tag", TagGoal, executeTag());

    sdm.addIngester(GraphQL.ingester("podDeployments"));

    sdm.addGoalImplementation("updateStagingK8Specs", UpdateStagingK8SpecsGoal,
        k8SpecUpdater(sdm.configuration.sdm, "staging"));
    sdm.addGoalImplementation("updateProdK8Specs", UpdateProdK8SpecsGoal,
        k8SpecUpdater(sdm.configuration.sdm, "prod"));

    sdm.addGoalImplementation("updateVersion", NodeVersionGoal, executeVersioner(NodeProjectVersioner));

    dockerBuildGoal.with({
        preparations: NpmPreparations,
        imageNameCreator: DefaultDockerImageNameCreator,
        options: {
            ...sdm.configuration.sdm.docker.jfrog as DockerOptions,
            push: true,
        },
    });

    sdm.addGoalSideEffect(
        DeployToStaging,
        "deployToStaging",
        allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
    );

    sdm.addGoalSideEffect(
        DeployToProd,
        "deployToProd",
        allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
    );

    sdm.addEvent({
        name: "handleRunningPod",
        description: "Update goal based on running pods in an environemnt",
        subscription: GraphQL.subscription("runningPods"),
        listener: handleRuningPods(),
    });

    sdm.addAutofix(
        {
            name: "maven-repo-cache",
            transform: addCacheHooks,
            pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
        },
    );

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

    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}
