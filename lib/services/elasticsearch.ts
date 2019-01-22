import * as k8s from "@kubernetes/client-node";
import { ServiceRegistration } from "@atomist/sdm";

export function elasticsearch(tag: string = "latest", password: string = "MagicWord"): ServiceRegistration<k8s.V1Container> {

    const spec: k8s.V1Container = {
        name: "elasticsearch",
        image: `docker.elastic.co/elasticsearch/elasticsearch:${tag}`,
        imagePullPolicy: "IfNotPresent",
        env: [{
            name: "discovery.type",
            value: "single-node",
        }, {
            name: "xpack.monitoring.enabled",
            value: "false",
        }, {
            name: "xpack.ml.enabled",
            value: "false",
        }, {
            name: "ELASTIC_PASSWORD",
            value: password,
        },
        ],
    } as any;

    return {
        name: "elasticsearch",
        service: async goalEvent => {
            if (goalEvent.repo.name === "pochta") {
                return {
                    type: "kubernetes",
                    spec,
                };
            }
            return undefined;
        },
    };
}