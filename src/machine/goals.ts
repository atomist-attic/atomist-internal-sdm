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
    AutofixGoal,
    BuildGoal,
    Goal,
    Goals,
    goals,
    IndependentOfEnvironment,
    ProductionEnvironment,
    ReviewGoal,
    StagingEnvironment,
} from "@atomist/sdm";
import {
    DockerBuildGoal,
    TagGoal,
    VersionGoal,
} from "@atomist/sdm-core";

// GOALSET Definition

export const PublishGoal = new Goal({
    uniqueName: "Publish",
    environment: IndependentOfEnvironment,
    orderedName: "2-publish",
    displayName: "publish",
    workingDescription: "Publishing...",
    completedDescription: "Published",
    failedDescription: "Published failed",
});

export const UpdateStagingK8SpecsGoal = new Goal({
    uniqueName: "UpdateStagingK8Specs",
    environment: StagingEnvironment,
    orderedName: "5-update-staging-k8-specs",
    displayName: "update staging k8s specs",
    workingDescription: "Updating `staging` K8 specs...",
    completedDescription: "Update `staging` K8 specs",
    failedDescription: "Update `staging` K8 specs failed",
});

export const DeployToStaging = new Goal({
    uniqueName: "DeployToStaging",
    environment: StagingEnvironment,
    orderedName: "5.1-deploy-to-staging",
    displayName: "deploy to `staging`",
    workingDescription: "Deploying to `staging`",
    completedDescription: "Deployed to `staging`",
    failedDescription: "Deployment to `staging` failed",
    waitingForApprovalDescription: "for `prod` promotion",
    approvalRequired: true,
});

export const IntegrationTestGoal = new Goal({
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

export const UpdateProdK8SpecsGoal = new Goal({
    uniqueName: "UpdateProdK8Specs",
    environment: ProductionEnvironment,
    orderedName: "7-update-prod-k8-specs",
    displayName: "update prod k8s specs",
    workingDescription: "Updating `prod` K8 specs...",
    completedDescription: "Update `prod` K8 specs",
    failedDescription: "Update `prod` K8 specs failed",
});

export const DeployToProd = new Goal({
    uniqueName: "DeployToProd",
    environment: ProductionEnvironment,
    orderedName: "5.1-deploy-to-prod",
    displayName: "deploy to prod",
    workingDescription: "Deploying to `prod`",
    completedDescription: "Deployed to `prod`",
    failedDescription: "Deployment to `prod` failed",
});

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(VersionGoal, ReviewGoal);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(AutofixGoal, TagGoal);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(BuildGoal).after(ReviewGoal);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(LeinBuildGoals, DefaultBranchGoals)
    .plan(PublishGoal).after(BuildGoal);

export const LeinDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinBuildGoals, DockerBuildGoal);

export const LeinDefaultBranchDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinDockerGoals, DefaultBranchGoals)
    .plan(UpdateStagingK8SpecsGoal).after(TagGoal)
    .plan(DeployToStaging).after(UpdateStagingK8SpecsGoal)
    .plan(UpdateProdK8SpecsGoal).after(DeployToStaging)
    .plan(DeployToProd).after(UpdateProdK8SpecsGoal);
