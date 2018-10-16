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

// GOAL Definition

import {
    Fingerprint,
    goals,
    Goals,
    GoalWithFulfillment,
    IndependentOfEnvironment,
    ProductionEnvironment,
    StagingEnvironment,
} from "@atomist/sdm";
import { Tag } from "@atomist/sdm-core";
import {
    DefaultBranchGoals,
    LeinDockerGoals,
    dockerBuild,
    LeinBuildGoals,
    leinBuild,
} from "@atomist/sdm-pack-clojure";
import { tag } from "@atomist/sdm-pack-clojure";
import { DockerBuild } from "@atomist/sdm-pack-docker";

// GOALSET Definition

export const updateStagingK8Specs = new GoalWithFulfillment({
    uniqueName: "UpdateStagingK8Specs",
    environment: StagingEnvironment,
    orderedName: "5-update-staging-k8-specs",
    displayName: "update staging k8s specs",
    workingDescription: "Updating `staging` K8 specs...",
    completedDescription: "Updated `staging` K8 specs",
    failedDescription: "Update `staging` K8 specs failed",
});

export const deployToStaging = new GoalWithFulfillment({
    uniqueName: "deployToStaging",
    environment: StagingEnvironment,
    orderedName: "5.1-deploy-to-staging",
    displayName: "deploy to `staging`",
    workingDescription: "Deploying to `staging`",
    completedDescription: "Deployed to `staging`",
    failedDescription: "Deployment to `staging` failed",
    requestedDescription: "Waiting for `staging` deployment",
});

export const integrationTest = new GoalWithFulfillment({
    uniqueName: "IntegrationTest",
    environment: StagingEnvironment,
    orderedName: "6-integration-test",
    displayName: "integration test",
    workingDescription: "Running integration tests...",
    completedDescription: "Integration tests passed",
    failedDescription: "Integration tests failed",
    waitingForApprovalDescription: "Promote to `prod`",
    approvalRequired: true,
    retryFeasible: true,
    isolated: true,
});

export const updateProdK8Specs = new GoalWithFulfillment({
    uniqueName: "UpdateProdK8Specs",
    environment: ProductionEnvironment,
    orderedName: "7-update-prod-k8-specs",
    displayName: "update prod k8s specs",
    workingDescription: "Updating `prod` K8 specs...",
    completedDescription: "Updated `prod` K8 specs",
    failedDescription: "Update `prod` K8 specs failed",
    waitingForPreApprovalDescription: "Ready to update `prod` K8 specs",
    preApprovalRequired: true,
});

export const deployToProd = new GoalWithFulfillment({
    uniqueName: "deployToProd",
    environment: ProductionEnvironment,
    orderedName: "5.1-deploy-to-prod",
    displayName: "deploy to prod",
    workingDescription: "Deploying to `prod`",
    completedDescription: "Deployed to `prod`",
    failedDescription: "Deployment to `prod` failed",
    requestedDescription: "Waiting for `prod` deployment",
});

export const nodeVersion = new GoalWithFulfillment({
    uniqueName: "nodeVersion",
    environment: IndependentOfEnvironment,
    displayName: "update version",
    workingDescription: "Updating version",
    completedDescription: "Updated version",
    failedDescription: "Update version failed",
});

export const nodeDockerBuild = new DockerBuild();
export const neoApolloDockerBuild = new DockerBuild({ uniqueName: "apollo-build" });
export const fingerprint = new Fingerprint();
export const nodeTag = new Tag();

export const NodeServiceGoals: Goals = goals("Simple Node Service Goals")
    .plan(nodeVersion)
    .plan(nodeDockerBuild).after(nodeVersion)
    .plan(nodeTag).after(nodeDockerBuild)
    .plan(updateStagingK8Specs).after(nodeTag)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(updateProdK8Specs).after(deployToStaging)
    .plan(deployToProd).after(updateProdK8Specs);

export const BranchNodeServiceGoals: Goals = goals("Simple Node Service Goals")
    .plan(nodeVersion)
    .plan(nodeDockerBuild).after(nodeVersion)
    .plan(nodeTag).after(nodeDockerBuild);

export const LeinDefaultBranchDockerGoals: Goals = goals("Lein Docker Build")
    .plan(DefaultBranchGoals, LeinDockerGoals)
    .plan(updateStagingK8Specs).after(tag)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(updateProdK8Specs).after(deployToStaging)
    .plan(deployToProd).after(updateProdK8Specs);

export const LeinAndNodeDockerGoals: Goals = goals("Lein and npm combined goals")
    .plan(LeinBuildGoals, DefaultBranchGoals)
    .plan(neoApolloDockerBuild).after(leinBuild)
    .plan(dockerBuild).after(neoApolloDockerBuild)
    .plan(tag).after(neoApolloDockerBuild)
    .plan(updateStagingK8Specs).after(tag)
    .plan(deployToStaging).after(updateStagingK8Specs)
    .plan(updateProdK8Specs).after(deployToStaging)
    .plan(deployToProd).after(updateProdK8Specs);