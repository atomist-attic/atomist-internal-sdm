import {
    DefaultGoalNameGenerator,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal,
    GoalDefinition,
    ImplementationRegistration,
    IndependentOfEnvironment,
    GoalInvocation,
} from "@atomist/sdm";
import { DockerProgressReporter } from "@atomist/sdm-pack-docker";
import {
    DefaultDockerImageNameCreator,
    DockerImageNameCreator,
    DockerOptions,
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

    constructor(string = DefaultGoalNameGenerator.generateName("docker-build"),
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
            goalExecutor: (r: GoalInvocation) => {
                // I think this requires more work to collect up responses
                // from the executeDockerBuild function and combine them
                // to create an approprate response for the goalExecturo
                registration.forEach(element => {
                    executeDockerBuild(
                        element.imageNameCreator ? element.imageNameCreator : DefaultDockerImageNameCreator,
                        element.options,
                    )
                });
            },
            name: DefaultGoalNameGenerator.generateName("docker-builder"),
            progressReporter: DockerProgressReporter,
            // not sure this is actually required but clearly this isn't a great
            // way to do this!
            ...registration[0] as ImplementationRegistration
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