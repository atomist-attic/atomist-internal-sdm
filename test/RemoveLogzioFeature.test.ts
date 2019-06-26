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
    InMemoryProject,
    SimpleRepoId,
} from "@atomist/automation-client";
import * as fs from "fs";
import * as assert from "power-assert";
import * as logzio from "../lib/machine/fingerprints/RemoveLogzio";

describe("RemoveLogzioFeature", () => {

    it("should exract fingerprints if there's a logzio appender and not apply it", async () => {
        const content = fs.readFileSync("test/logzio-logback.xml").toLocaleString();
        const p = InMemoryProject.from(new SimpleRepoId("atomist", "sdm"),
            { path: "resources/logback.xml", content });
        const result = await logzio.createFingerprints(p);
        assert.deepEqual(result, [{
            type: "logzio-presence",
            data: true,
            name: "logzio-detected",
             abbreviation: "logzio-presence",
             version: "0.0.1", sha:
             "ee8c5cdc8aa140033be7fe8ebfba79d9ce1e28b23dd1e94c390ee14b106ec40a"}]);
        assert(false === await logzio.applyFingerprint(p, result[0]));
    });
    it("should apply the target fingerprint if not currently the target", async () => {
        const content = fs.readFileSync("test/logzio-logback.xml").toLocaleString();
        const p = InMemoryProject.from(new SimpleRepoId("atomist", "sdm"),
            { path: "resources/logback.xml", content });
        const result = await logzio.createFingerprints(p);
        assert(true === (await (await p.getFile("resources/logback.xml")).getContent()).includes("io.logz"), "Should include io.logz");
        assert.deepEqual(result, [{
            type: "logzio-presence",
            data: true,
            name: "logzio-detected",
             abbreviation: "logzio-presence",
             version: "0.0.1", sha:
             "ee8c5cdc8aa140033be7fe8ebfba79d9ce1e28b23dd1e94c390ee14b106ec40a"}]);
        const targetfp = result[0];
        targetfp.data = false;
        assert(true === await logzio.applyFingerprint(p, targetfp));
        const after = await logzio.createFingerprints(p);
        assert(false === after[0].data);
        assert("7d2488246b6cc7ec838d6c25b25731d5d7c005085c391aa511e760150030d616" === after[0].sha);
        assert(false === (await (await p.getFile("resources/logback.xml")).getContent()).includes("io.logz"), "Should not include io.logz");
        assert(false === await logzio.applyFingerprint(p, targetfp));
    });
});
