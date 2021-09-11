const fs = require('fs')

module.exports = async function download({ context, github }) {
    const NAME = 'site.tgz'
    const PATH = `${process.env.WORKSPACE}/${NAME}.zip`

    const artifacts = await github.actions.listWorkflowRunArtifacts({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: process.env.WORKFLOW_RUN_ID,
    })

    const deployTree = artifacts.data.artifacts.find(
        ({ name }) => name === NAME,
    )

    if (!deployTree) {
        return JSON.stringify({ deploy_path: null })
    }

    const download = await github.actions.downloadArtifact({
        owner: context.repo.owner,
        repo: context.repo.repo,
        artifact_id: deployTree.id,
        archive_format: 'zip',
    })

    fs.writeFileSync(PATH, Buffer.from(download.data))

    return JSON.stringify({ deploy_path: PATH })
}
