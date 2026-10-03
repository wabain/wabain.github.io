#!/usr/bin/env python3

from __future__ import annotations

from dataclasses import dataclass
import dataclasses
from http.client import HTTPResponse
import itertools
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Literal
from urllib.error import HTTPError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
import os
import re

from .utils import run
from .output import print_info_line, print_info_multi

REPO = "wabain/wabain.github.io"

# Workflow which validates pull requests (name: "Build and test")
VALIDATE_WORKFLOW = "validate.yml"

BuildState = Literal["success", "pending", "failure", "missing"]


@dataclass(kw_only=True)
class PullRequestEvaluation:
    raw: str = dataclasses.field(repr=False, hash=False, compare=False)

    head_ref: str
    head_sha: str
    base_ref: str
    merge_sha: str | None

    pr_is_open: bool

    merge_pending_label_present: bool
    merge_isolate_label_present: bool
    merge_blocked_label_present: bool
    pr_is_eligible: bool
    pr_may_be_eligible: bool
    pr_is_eligible_up_to_mergeability: bool

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


def is_pull_request_merged(pr_number: int) -> bool:
    with get_github_api(f"/repos/{REPO}/pulls/{pr_number}") as response:
        return bool(json.load(response)["merged"])


def list_open_pull_requests() -> list[dict[str, Any]]:
    """List open pull requests, oldest first"""
    per_page = 100
    pulls: list[dict[str, Any]] = []

    for page in itertools.count(1):
        params = f"state=open&sort=created&direction=asc&per_page={per_page}&page={page}"

        with get_github_api(f"/repos/{REPO}/pulls?{params}") as response:
            page_pulls = json.load(response)

        pulls.extend(page_pulls)

        if len(page_pulls) < per_page:
            break

    return pulls


def get_pull_request_build_state(head_sha: str) -> BuildState:
    """Get the state of the latest pull request validation run for the given head commit"""
    if not re.fullmatch("[0-9a-f]{40}", head_sha):
        raise ValueError(f"invalid commit SHA: {head_sha!r}")

    # The workflow runs API can't filter by pull request number, so runs are
    # looked up by the head commit instead. This also ensures the result is for
    # the same commit the pull request was evaluated at, not an earlier push.
    params = f"event=pull_request&head_sha={head_sha}&per_page=100"

    with get_github_api(
        f"/repos/{REPO}/actions/workflows/{VALIDATE_WORKFLOW}/runs?{params}"
    ) as response:
        runs = json.load(response)["workflow_runs"]

    if not runs:
        state: BuildState = "missing"
    else:
        latest = max(runs, key=lambda run: run["created_at"])

        if latest["status"] != "completed":
            state = "pending"
        elif latest["conclusion"] == "success":
            state = "success"
        else:
            state = "failure"

    print_info_line("build state", head_sha, state)
    return state


def add_comment(pr_number: int, body: str) -> None:
    get_github_api(
        f"/repos/{REPO}/issues/{pr_number}/comments",
        method="POST",
        data=json.dumps({"body": body}).encode(),
    )


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
    check_status: bool = True,
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
        response = urlopen(req)

        if not isinstance(response, HTTPResponse):
            raise TypeError(f"unexpected response type for {method} request to {url}: {response!r}")

        match response.status:
            case s if not check_status or 200 <= s < 300:
                pass

            case s if 300 <= s < 400:
                if method not in ("GET", "HEAD"):
                    msg = f"unexpected status {response.status} for {method} request"
                    raise HTTPError(req.full_url, response.status, msg, response.headers, None)

            case _:
                raise HTTPError(
                    req.full_url, response.status, response.reason, response.headers, None
                )

        return response

    except HTTPError as exc:
        exc.add_note(f"unsuccessful {method} request to {url}")
        raise
