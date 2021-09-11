const fs = require('fs')

module.exports = async function download({ context, github, core }) {
    const NAME = 'site.tgz'
    const PATH = `${process.env.WORKSPACE}/${NAME}.zip`

    const artifacts = await github.actions.listWorkflowRunArtifacts({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: process.env.WORKFLOW_RUN_ID,
    })

    core.group('artifacts list', () => core.info(toJson(artifacts)))

    const deployTree = artifacts.data.artifacts.find(
        ({ name }) => name === NAME,
    )

    if (!deployTree) {
        core.info(`no artifact found with name ${NAME}`)
        return toJson({ deploy_path: null })
    }

    const download = await github.actions.downloadArtifact({
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifact_id: deployTree.id,
        archive_format: 'zip',
    })

    fs.writeFileSync(PATH, Buffer.from(download.data))

    core.info(`wrote artifact ${NAME} from ${deployTree.id} to ${PATH}`)

    return toJson({ deploy_path: PATH })
}

function toJson(input) {
    return JSON.stringify(input, undefined, '    ')
}
