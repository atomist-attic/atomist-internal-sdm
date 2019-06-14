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
    astUtils,
    logger,
} from "@atomist/automation-client";
import { renderData } from "@atomist/clj-editors";
import { DockerFileParser } from "@atomist/sdm-pack-docker";
import { ApplyFingerprint, ExtractFingerprint, Feature, FP, sha256 } from "@atomist/sdm-pack-fingerprints";

/**
 * Construct a Docker base image fingerprint from the given image and version
 * @param {string} image
 * @param {string} version
 * @return {FP}
 */
export function createDockerBaseFingerprint(image: string, version: string): FP {
    const data = { image, version };
    return {
        type: DockerFrom.name,
        name: image,
        abbreviation: `dbi-${image}`,
        version: "0.0.1",
        data,
        sha: sha256(JSON.stringify(data)),
    };
}

export const dockerBaseFingerprint: ExtractFingerprint = async p => {
    const file = await p.getFile("docker/Dockerfile");
    if (file && await file.getContent() !== "") {
        const imageName: string[] = await astUtils.findValues(
            p, DockerFileParser, "docker/Dockerfile", "//FROM/image/name");
        const imageVersion: string[] = await astUtils.findValues(
            p, DockerFileParser, "docker/Dockerfile", "//FROM/image/tag");

        const fp: FP = createDockerBaseFingerprint(imageName[0], imageVersion[0] || "latest");

        return fp;
    } else {
        return undefined;
    }
};

export const applyDockerBaseFingerprint: ApplyFingerprint = async (p, fp) => {
    logger.info(`apply ${renderData(fp)} to ${p.id.url}`);

    interface DockerFP {
        name: string;
        version: string;
    }

    const newFP = fp.data as DockerFP;

    try {
        await astUtils.doWithAllMatches(
            p,
            DockerFileParser,
            "docker/Dockerfile",
            "//FROM/image/tag",
            n => n.$value = newFP.version,
        );
        return (true);
    } catch (e) {
        logger.error(e);
        return false;
    }
};

export const DockerFrom: Feature = {
    displayName: "Docker base image",
    name: "docker-base-image",
    apply: applyDockerBaseFingerprint,
    extract: dockerBaseFingerprint,
    selector: myFp => myFp.type && myFp.type === DockerFrom.name,
    toDisplayableFingerprint: fp => fp.data.version,
};
