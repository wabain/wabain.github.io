const fs = require('fs/promises')

const NAME = 'site.tgz'

/**
 * Download the 'site.tgz' artifact from the workflow run the given ID to the path `site.tgz.zip`
 * within `workspace`. The artifact should be a zip file which contains a metadata file named
 * `site.revisions.json` as well as the `site.tgz` tarfile.
 *
 * This download function only ensures that the artifact is associated with the current repository.
 * For pull requests, the later PR evaluation step will make sure that `site.revisions.json`
 * contains parameters corresponding to the latest pull request run on the correct branch, etc. (The
 * artifact's data is presumed trusted.)
 *
 * For pushes, at the time of writing we *don't* explicitly check that the data is up to date,
 * because there generally shouldn't be multiple CI runs associated with a single pushed ref.
 * However, for both pull requests and pushes we add force-with-lease arguments to ensure the input
 * commit IDs from `site.revisions.json` still match the repository state.
 *
 * @param {{ workflowRunId: number, workspace: string }} args
 * @param {{ context: unknown, github: unknown, core: unknown }} apis API handles provided by
 * actions/github-script
 */
module.exports = async function download(
    { workflowRunId, workspace },
    { context, github, core },
) {
    const PATH = `${workspace}/${NAME}.zip`

    const artifacts = await github.rest.actions.listWorkflowRunArtifacts({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: workflowRunId,
    })

    core.group('artifacts list', () => core.info(toJson(artifacts)))

    const deployTree = artifacts.data.artifacts.find(
        ({ name }) => name === NAME,
    )

    if (!deployTree) {
        core.info(`no artifact found with name ${NAME}`)
        return { deploy_path: null }
    }

    const download = await github.rest.actions.downloadArtifact({
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifact_id: deployTree.id,
        archive_format: 'zip',
    })

    await fs.writeFile(PATH, Buffer.from(download.data))

    core.info(`wrote artifact ${NAME} from ${deployTree.id} to ${PATH}`)

    return { deploy_path: PATH }
}

function toJson(input) {
    return JSON.stringify(input, undefined, '    ')
}
