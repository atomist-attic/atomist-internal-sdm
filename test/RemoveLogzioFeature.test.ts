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
   // logger,
    SimpleRepoId,
} from "@atomist/automation-client";
import * as fs from "fs";
import * as assert from "power-assert";
import * as logzio from "../lib/machine/fingerprints/RemoveLogzio";

describe("RemoveLogzioFeature", () => {

    it("should exract fingerprints if there's a logzio appender and apply it", async () => {
        const content = fs.readFileSync("test/logzio-logback.xml").toLocaleString();
        const p = InMemoryProject.from(new SimpleRepoId("atomist", "sdm"),
            { path: "resources/logback.xml", content });
        const result = await logzio.createFingerprints(p);
        assert.deepEqual(result, [{
            type: "logzio-presence",
            data: undefined,
            name: "logzio-detected",
             abbreviation: "logzio-presence",
             version: "0.0.1", sha:
             "7991b7f32d46efd8eccf66a1f1a19cbaa8449335b069b92065f72110a146e444"}]);
        assert(true === await logzio.applyFingerprint(p, result[0]));
        assert(fs.readFileSync("test/logzio-logback-fixed.xml").toLocaleString() === await (await p.getFile("resources/logback.xml")).getContent());
    });
});
