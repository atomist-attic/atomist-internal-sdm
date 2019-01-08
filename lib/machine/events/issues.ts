import { EventFired, HandlerContext, NoParameters, OnEvent, Success } from "@atomist/automation-client";
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
