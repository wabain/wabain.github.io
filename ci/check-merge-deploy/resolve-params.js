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
                        head: { ref: headRef },
                        base: { ref: baseRef },
                    } = prs[0]

                    return logOutputs(core, {
                        workflow_run: run.id,
                        workflow_run_url: run.html_url,
                        conclusion: run.conclusion,

                        effective_event: 'pull_request',
                        pr_number: number,
                        head_ref: headRef,
                        base_ref: baseRef,
                    })
                }

                case 'push': {
                    return logOutputs(core, {
                        workflow_run: run.id,
                        workflow_run_url: run.html_url,
                        conclusion: run.conclusion,

                        effective_event: 'push',
                        ref: context.ref,
                        sha: context.sha,
                        head_ref: context.ref,
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
                head: { ref: headRef },
                base: { ref: baseRef },
            } = latestRun
                ? latestRun.pull_requests.find(
                      (pr) => pr.number === targetPr.number,
                  )
                : targetPr

            return logOutputs(core, {
                workflow_run: latestRun ? latestRun.id : null,
                workflow_run_url: latestRun ? latestRun.html_url : null,
                conclusion: latestRun ? latestRun.conclusion : null,

                effective_event: 'pull_request',
                pr_number: number,
                head_ref: headRef,
                base_ref: baseRef,
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

    const logNotice = core.notice
        ? (...args) => core.notice(...args)
        : (...args) => core.info(...args)

    if (outputs.workflow_run === null) {
        logNotice('no associated workflow run found')
    } else {
        logNotice(
            `workflow run ${outputs.workflow_run} (conclusion: ${outputs.conclusion}): ${outputs.workflow_run_url}`,
        )
    }

    switch (outputs.effective_event) {
        case 'pull_request':
            logNotice(
                `for pull_request #${outputs.pr_number} from ${outputs.head_ref} into ${outputs.base_ref}`,
            )
            break

        case 'push':
            logNotice(`for push of ${outputs.head_sha} to ${outputs.head_ref}`)
            break

        default:
            logNotice(`for ${outputs.effective_event}`)
            break
    }

    return outputs
}

function toJson(input) {
    return JSON.stringify(input, undefined, '    ')
}
