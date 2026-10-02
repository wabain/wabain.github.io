from . import (
    deploy_commit,
    dispatch_merge_queue,
    evaluate_queue_pr,
    land_batch,
    record_batch_failure,
    stage_batch,
)

SUBCOMMAND_IMPLS = [
    deploy_commit,
    dispatch_merge_queue,
    evaluate_queue_pr,
    stage_batch,
    land_batch,
    record_batch_failure,
]
