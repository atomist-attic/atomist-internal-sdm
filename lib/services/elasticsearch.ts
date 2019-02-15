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

import {
    K8sServiceRegistration,
    K8sServiceSpec,
} from "@atomist/sdm-core";
import { K8sServiceRegistrationType } from "@atomist/sdm-core/lib/pack/k8s/service";
import * as k8s from "@kubernetes/client-node";

export function elasticsearch(tag: string = "latest", password: string = "MagicWord"): K8sServiceRegistration {

    const container: k8s.V1Container = {
        name: "elasticsearch",
        image: `docker.elastic.co/elasticsearch/elasticsearch:${tag}`,
        imagePullPolicy: "IfNotPresent",
        resources: {
            limits: {
                cpu: 0.5,
                memory: "1536Mi",
            },
            requests: {
                cpu: 0.5,
                memory: "1536Mi",
            },
        },
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

    const spec: K8sServiceSpec = {
        container,
    };

    return {
        name: "elasticsearch",
        service: async goalEvent => {
            if (goalEvent.repo.name === "pochta") {
                return {
                    type: K8sServiceRegistrationType.K8sService,
                    spec,
                };
            }
            return undefined;
        },
    };
}
