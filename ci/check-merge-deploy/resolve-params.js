module.exports = async function resolveMergeCheckParameters({
    context,
    github,
}) {
    switch (context.eventName) {
        case 'workflow_run': {
            const run = context.payload.workflow_run

            // sanity check: should be enforced by job-level `if`
            if (run.conclusion !== 'success') {
                throw new Error(
                    `unexpected workflow run event conclusion: ${JSON.stringify(
                        run,
                    )}`,
                )
            }

            switch (run.event) {
                case 'pull_request': {
                    const prs = context.payload.pull_requests

                    if (prs.length !== 1) {
                        throw new Error(
                            `expected one pull request associated with run, got ${JSON.stringify(
                                prs,
                            )}`,
                        )
                    }

                    const {
                        number,
                        head: { ref: headRef, sha: headSha },
                        base: { ref: baseRef, sha: baseSha },
                    } = prs[0]

                    return JSON.stringify({
                        workflow_run: run.id,
                        conclusion: run.conclusion,

                        effective_event: 'pull_request',
                        pr_number: number,
                        head_ref: headRef,
                        head_sha: headSha,
                        base_ref: baseRef,
                        base_sha: baseSha,
                    })
                }

                case 'push': {
                    return JSON.stringify({
                        workflow_run: run.id,
                        conclusion: run.conclusion,

                        effective_event: 'push',
                        head_ref: context.ref,
                        head_sha: context.sha,
                    })
                }

                default: {
                    throw new Error(
                        `unexpected workflow run event: ${JSON.stringify(run)}`,
                    )
                }
            }
        }

        case 'pull_request_target':
        case 'pull_request_review': {
            const targetPr = context.payload.pull_request

            const runs = await github.actions.listWorkflowRuns({
                owner: context.repo.owner,
                repo: context.repo.repo,
                workflow_id: 'base.yaml',
                event: 'pull_request',
                branch: targetPr.head.ref,
            })

            const latestRun = runs
                .filter((run) =>
                    run.pull_requests.some(
                        (pr) => pr.number === targetPr.number,
                    ),
                )
                .reduce((r1, r2) => (r1.created_at < r2.created_at ? r2 : r1))

            const {
                number,
                head: { ref: headRef, sha: headSha },
                base: { ref: baseRef, sha: baseSha },
            } = latestRun?.find((pr) => pr.number === targetPr.number) ??
            targetPr

            return JSON.stringify({
                workflow_run: latestRun?.id ?? null,
                conclusion: latestRun?.conclusion ?? null,

                effective_event: 'pull_request',
                pr_number: number,
                head_ref: headRef,
                head_sha: headSha,
                base_ref: baseRef,
                base_sha: baseSha,
            })
        }

        default: {
            throw new Error(`unexpected triggering event: ${context.eventName}`)
        }
    }
}
