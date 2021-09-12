module.exports = async function resolveMergeCheckParameters({
    context,
    github,
    core,
}) {
    logGrouped(core, 'Event payload', toJson(context.payload))

    switch (context.eventName) {
        case 'workflow_run': {
            const run = context.payload.workflow_run

            switch (run.event) {
                case 'pull_request': {
                    const prs = run.pull_requests

                    if (prs.length !== 1) {
                        throw new Error(
                            `expected one pull request, got ${toJson(prs)}`,
                        )
                    }

                    const {
                        number,
                        head: { ref: headRef, sha: headSha },
                        base: { ref: baseRef, sha: baseSha },
                    } = prs[0]

                    return logOutputs(core, {
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
                    return logOutputs(core, {
                        workflow_run: run.id,
                        conclusion: run.conclusion,

                        effective_event: 'push',
                        head_ref: context.ref,
                        head_sha: context.sha,
                    })
                }

                default: {
                    throw new Error(
                        `unexpected workflow run event: ${toJson(run)}`,
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
                workflow_id: 'validate.yml',
                event: 'pull_request',
                branch: targetPr.head.ref,
            })

            logGrouped(core, 'Listed runs', toJson(runs))

            const relevantRuns = runs.data.workflow_runs.filter((run) =>
                run.pull_requests.some((pr) => pr.number === targetPr.number),
            )

            const latestRun =
                relevantRuns.length === 0
                    ? null
                    : relevantRuns.reduce((r1, r2) =>
                          r1.created_at < r2.created_at ? r2 : r1,
                      )

            const {
                number,
                head: { ref: headRef, sha: headSha },
                base: { ref: baseRef, sha: baseSha },
            } = latestRun
                ? latestRun.pull_requests.find(
                      (pr) => pr.number === targetPr.number,
                  )
                : targetPr

            return logOutputs(core, {
                workflow_run: latestRun ? latestRun.id : null,
                conclusion: latestRun ? latestRun.conclusion : null,

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

function logGrouped(core, outer, inner) {
    core.startGroup(outer)
    core.info(inner)
    core.endGroup()
}

function logOutputs(core, outputs) {
    core.info(`outputs: ${toJson(outputs)}`)
    return outputs
}

function toJson(input) {
    return JSON.stringify(input, undefined, '    ')
}
