# USAGE: jq --slurp -f ci/pull-request/pull-request.jq $pr_file $review_file

def by_owner: .author_association == "OWNER";
def by_collaborator: by_owner or .author_association == "COLLABORATOR";

# Store the second input as $reviews then operate on the first
.[1] as $reviews |
.[0] |

# Evaluate PR eligibility
{
    automerge_label_present: .labels | any(.name == "automerge"),
    author_is_owner: by_owner,
    approver_is_owner: $reviews | any(.state == "APPROVED" and by_owner),
    approver_is_collaborator: $reviews | any(.state == "APPROVED" and by_collaborator),
    mergeable,
    non_draft: .draft | not,
} as $pr_eligibility |

(
    $pr_eligibility |
    .automerge_label_present and
        (.author_is_owner or .approver_is_owner) and
        .non_draft
) as $eligible_up_to_mergeability |

# Collate output
{
    head_ref: .head.ref,
    head_sha: .head.sha,
    head_commit: .head.sha, # Aliased

    base_ref: .base.ref,

    pr_is_open: (.state == "open"),

    merge_sha: .merge_commit_sha,
    merge_commit: .merge_commit_sha, # Aliased

    merge_pending_label_present: .labels | any(.name == "merge-pending"),
    merge_isolate_label_present: .labels | any(.name == "merge-isolate"),
    merge_blocked_label_present: .labels | any(.name == "merge-blocked"),

    # The merge queue determines mergeability itself by attempting the merge
    pr_is_eligible_up_to_mergeability: $eligible_up_to_mergeability,
    pr_eligibility: $pr_eligibility,
}
