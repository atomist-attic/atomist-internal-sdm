import { CommandHandlerRegistration } from "@atomist/sdm";

export interface K8SpecKickParameters {
    message: string;
}

export const K8SpecKick: CommandHandlerRegistration<K8SpecKickParameters> = {
    name: "K8SpecKick",
    description: "kick the service",
    intent: "kick service",
    parameters: {
        message: {
            default: "Kicking the service",
            required: false,
        },
    },
    listener: async cli => {
        return cli.addressChannels(`We're gonna kick it with message \`${cli.parameters.message}\``);
    },
};
