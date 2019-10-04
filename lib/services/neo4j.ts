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

export function neo4j(): K8sServiceRegistration {

    const container: k8s.V1Container = {
        name: "neo4j",
        image: `whostolebenfrog/neo4j-graphql:3.5.9.2`,
        imagePullPolicy: "IfNotPresent",
        resources: {
            limits: {
                cpu: 1.5,
                memory: "1536Mi",
            },
            requests: {
                cpu: 1.5,
                memory: "1536Mi",
            },
        },
        env: [{
            name: "NEO4J_dbms_memory_heap_initial__size",
            value: "1024M",
        }, {
            name: "NEO4J_dbms_memory_heap_max__size",
            value: "1024M",
        }],
    } as any;

    const spec: K8sServiceSpec = {
        container,
    };

    return {
        name: "neo4j",
        service: async goalEvent => {
            if (goalEvent.repo.name === "neo4j-ingester") {
                return {
                    type: K8sServiceRegistrationType.K8sService,
                    spec,
                };
            }
            return undefined;
        },
    };
}
