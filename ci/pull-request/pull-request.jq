# USAGE: jq --slurp -f ci/pull-request/pull-request.jq $pr_file $review_file

def by_owner: .author_association == "OWNER";

# Store the second input as $reviews then operate on the first
.[1] as $reviews |
.[0] |

# Evaluate PR eligibility
{
    automerge_label_present: .labels | any(.name == "automerge"),
    author_is_owner: by_owner,
    approver_is_owner: $reviews | any(.state == "APPROVED" and by_owner),
    mergeable,
    non_draft: .draft | not,
} as $pr_eligibility |

(
    $pr_eligibility |
    .automerge_label_present and
        (.author_is_owner or .approver_is_owner) and
        .mergeable and
        .non_draft
) as $pr_is_eligible |

# Collate output
{
    head_ref: .head.ref,
    head_commit: .head.sha,
    merge_commit: .merge_commit_sha,
    merge_pending_label_present: .labels | any(.name == "merge-pending"),
    pr_is_eligible: $pr_is_eligible,
    pr_eligibility: $pr_eligibility,
}
