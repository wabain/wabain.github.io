#!/usr/bin/env python3

from __future__ import annotations

from dataclasses import dataclass
import dataclasses
from http.client import HTTPResponse
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
import os

from .utils import run
from .output import print_info_line, print_info_multi


REPO = "wabain/wabain.github.io"


@dataclass(kw_only=True)
class PullRequestEvaluation:
    raw: str = dataclasses.field(repr=False, hash=False, compare=False)

    head_ref: str
    head_sha: str
    base_ref: str
    merge_sha: str | None

    merge_pending_label_present: bool
    pr_is_eligible: bool
    pr_may_be_eligible: bool

    pr_eligibility: dict[str, Any]


def evaluate_pull_request_state(pr_number: int) -> PullRequestEvaluation:
    with get_github_api(f"/repos/{REPO}/pulls/{pr_number}") as response:
        if response.status != 200:
            raise ValueError(f"unsuccessful pull request query response: {response}")

        pr = json.load(response)

    with get_github_api(pr["_links"]["self"]["href"] + "/reviews") as response:
        if response.status != 200:
            raise ValueError(f"unsuccessful pull request review query response: {response}")

        reviews = json.load(response)

    with (
        NamedTemporaryFile(mode="wt+", prefix=f"pr-{pr_number}.", suffix=".json") as pr_file,
        NamedTemporaryFile(
            mode="wt+", prefix=f"pr-{pr_number}.reviews.", suffix=".json"
        ) as review_file,
    ):
        json.dump(pr, pr_file)
        pr_file.flush()

        json.dump(reviews, review_file)
        review_file.flush()

        root_path = Path(__file__).parent.parent

        eval_result = run(
            [
                "jq",
                "--slurp",
                "-f",
                str(root_path / "pull-request/pull-request.jq"),
                pr_file.name,
                review_file.name,
            ]
        )

    mergeability = json.loads(eval_result)

    for k in ["head_commit", "base_commit", "merge_commit"]:
        if k in mergeability:
            del mergeability[k]

    print_info_multi(
        f"#{pr_number} eval",
        f'eligible {json.dumps(mergeability["pr_is_eligible"])}',
        json.dumps(mergeability, indent=2),
    )

    return PullRequestEvaluation(**mergeability, raw=eval_result)


def add_label(pr_number: int, label: str) -> None:
    get_github_api(
        f"/repos/{REPO}/issues/{pr_number}/labels",
        method="POST",
        data=json.dumps({"labels": [label]}).encode(),
    )


def remove_label(pr_number: int, label: str) -> None:
    if label != quote_plus(label):
        raise ValueError(f"invalid label: {label}")

    get_github_api(f"/repos/{REPO}/issues/{pr_number}/labels/{label}", method="DELETE")


def get_github_api(
    subpath: str,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    token: str | None = None,
    data: bytes | None = None,
) -> HTTPResponse:
    base_headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": REPO,
    }

    if (token := token or os.getenv("GH_TOKEN")) is not None:
        base_headers["Authorization"] = f"token {token}"

    url = subpath
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://api.github.com/" + subpath.removeprefix("/")

    if (relative_url := url.removeprefix("https://api.github.com/")) != url:
        if (repo_url := relative_url.removeprefix(f"repos/{REPO}/")) != relative_url:
            relative_url = "<repo>/" + repo_url
        else:
            relative_url = "<github>/" + relative_url
    print_info_line(method.lower(), relative_url)

    req = Request(url, headers={**base_headers, **(headers or {})}, method=method, data=data)

    try:
        return urlopen(req)
    except HTTPError as exc:
        exc.add_note(f"unsuccessful request to {url}")
        raise
