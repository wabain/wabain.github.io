from . import deploy_commit, land_batch, record_batch_failure, stage_batch

SUBCOMMAND_IMPLS = [
    deploy_commit,
    stage_batch,
    land_batch,
    record_batch_failure,
]
