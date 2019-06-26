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
    ApplyFingerprint,
    DiffSummaryFingerprint,
     ExtractFingerprint,
     Feature,
      FP,
      sha256,
 } from "@atomist/sdm-pack-fingerprints";

import * as R from "ramda";
import * as xml from "xml-js";
/**
 * Construct an FP indicating presence of logzio configuration
 * @return {FP}
 */
export function createFP(found: boolean): FP {
    return {
        type: "logzio-presence",
        name: "logzio-detected",
        abbreviation: "logzio-presence",
        version: "0.0.1",
        data: found,
        sha: sha256(`logzio-detected:${found}`),
    };
}
const isAppender = (e: any) => e.name === "appender" && e.attributes.class === "io.logz.logback.LogzioLogbackAppender";

const getAppenders = (jsonData: any) => {
    return R.map((e: any) => e.attributes.name,
            R.filter(isAppender, jsonData.elements[0].elements));
};

export const createFingerprints: ExtractFingerprint = async p => {
    const file = await p.getFile("resources/logback.xml");
    if (file) {

        const jsonData = xml.xml2js(await file.getContent());

        const appenders = getAppenders(jsonData);
        if (R.isEmpty(appenders)) {
            return [createFP(false)];
        }
        return [createFP(true)];
    }
    return undefined;
};

export const applyFingerprint: ApplyFingerprint = async (p, fp) => {
    if (fp.data === false || fp.data === "false") {
        const file = await p.getFile("resources/logback.xml");
        if (file) {
            const jsonData = xml.xml2js(await file.getContent());
            const appenders = getAppenders(jsonData);
            const newElements = R.reduce((acc, e: any) => {
                if (isAppender(e)) {
                    return acc;
                } else if (e.name === "root") {
                    e.elements = R.filter((ee: any) => {
                        return R.none((a: string) => {
                            return a === ee.attributes.ref;
                        }, appenders);
                    }, e.elements);
                    return R.append(e, acc);
                } else {
                    return R.append(e, acc);
                }
            }, [], jsonData.elements[0].elements);
            //  <logger name="io.logz.sender.com.bluejeans" level="OFF"/>
            const withoutLoggerConfig = R.filter((e: any) => e.attributes.name !== "io.logz.sender.com.bluejeans", newElements);
            if (withoutLoggerConfig.length !== jsonData.elements[0].elements.length) {
                jsonData.elements[0].elements = withoutLoggerConfig;
                await file.setContent(xml.js2xml(jsonData, {spaces: 2}));
                return true;
            }
            return false;
        }
        return false;
    }
    return false;
};

/* tslint:disable:max-line-length */
export const fingerpintSummary: DiffSummaryFingerprint = (diff, target) => {
    return {
        title: "Logzio Configuration Found",
        description:
            `Logzio is deprecated and should be removed`,
    };
};

export const LogzioPresence: Feature = {
    displayName: "logzio config presence",
    name: "logzio-presence",
    extract: createFingerprints,
    selector: fp => fp.name.startsWith(LogzioPresence.name),
    summary: fingerpintSummary,
    toDisplayableFingerprint: fp => fp.data,
};
