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
    EventFired,
    HandlerContext,
    NoParameters,
    OnEvent,
    Success,
} from "@atomist/automation-client";
import _ = require("lodash");
import { PullRequests } from "../../typings/types";

import jaccard = require ("jaccard-similarity-sentences");

// const issueRegEx = /(\s+#+\d+\s+)|(\s+#+\d+\n)|(\w+\/\w+#\d+\s+)|(\w+\/\w+#\d+\n)/g;

// function hasIssuesMentioned(pr: PullRequests.PullRequest): boolean {
//     return _.some(pr.commits, (commit: PullRequests.Commits, idx) => commit.message.match(issueRegEx))
//         || (pr.body && pr.body.match(issueRegEx)) !== undefined
//         || (pr.title && pr.title.match(issueRegEx)) !== undefined
//         || _.some(pr.comments, (comment: PullRequests.Comments) => comment.body.match(issueRegEx));
// }

function getMatchingIssue(pr: PullRequests.PullRequest): any {
    const issues = pr.repo.issues || [];
    // if (!hasIssuesMentioned(pr)) {
    // logger.info("No current associated issues...");
    const scored = issues.map(issue => {
            if (issue.title.length > 1 && pr.title.length > 1) {
                return {issue, score: jaccard.jaccardSimilarity(issue.title, pr.title)};
            } else {
                return {issue, score: 0};
            }
        });
    const ranked = _.sortBy(scored, (s: any)  => s.score);
    const filtered = _.filter(ranked, (i: any ) => i.score > 0.3);
    if (filtered.length > 0) {
        return ranked[ranked.length - 1];
    }
    return undefined;

    // }
    // logger.info("PR/commit already has issues");
    // return undefined;
}

export function handlePullRequestIssues(): OnEvent<PullRequests.Subscription, NoParameters> {
    return async (e: EventFired<PullRequests.Subscription>, context: HandlerContext) => {
        const pr = e.data.PullRequest[0];
        const issue = getMatchingIssue(pr);
        if (issue) {
            await context.messageClient.addressUsers(
                `PR title \`${pr.title}\` matches \`${issue.issue.title}\` : ${issue.score}`,
                "UDE4S24RK");

        }
        return Success;
    };
}
