#!/usr/bin/env node
//
// Help plan manual npm major upgrades. Automated tools like Dependabot
// update one package at a time, so they can't reach a major whose peer
// dependencies need other packages to move with it. This script finds those
// majors and the groups of packages that could move together to reach them.
//
// It works from a simplified model. Throughout, a "major" is a release line:
// a major version, or a minor version for 0.x packages, matching where caret
// ranges like ^0.3.0 draw the line for breaking changes.
//
//  - A package is "stuck" when its newest installable version, with every
//    other package kept within its current major, is below its latest major.
//    Deprecated versions don't count, since update tools skip them, but they
//    are still offered as upgrade paths.
//  - The script considers only direct dependencies and peer dependencies
//    reached transitively from them. Peers of other indirect dependencies are
//    ignored, since pnpm usually resolves those against their parent rather
//    than the root.
//  - Each package's options are its current version and the newest release in
//    each later major up to its `latest` tag. Peer ranges that only older
//    releases within a major accept are not considered.
//
// The output uses these terms:
//
//  - A group is a minimal set of packages that must all move up at least one
//    major together for some stuck package to reach a given major.
//  - An option is a set of versions within a group. A group prints several
//    options when its members' versions are coupled; a row of alternatives
//    such as `9.39.5 | 10.12.0` means any of them works with the rest.
//  - A section (`=== ...`) collects groups that share packages, so each
//    section can be planned independently.
//
// Run with --help for usage.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import semver from "semver";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const usage = `\
Usage: node bin/find-peer-dep-deadlocks.mjs [--max-group N] [package...]

Find npm major updates that peer dependencies stop from being made one
package at a time, and the groups of packages that could move together.

Arguments:
  package          Only show the sections that involve these packages

Options:
  --max-group N    Largest group of packages to search for (default: 12)
  --commands       Print a pnpm command to install each option
  -h, --help       Show this help
`;

let parsed;
try {
  parsed = parseArgs({
    options: {
      "max-group": { type: "string", default: "12" },
      commands: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
} catch (e) {
  process.stderr.write(`${e.message}\n\n${usage}`);
  process.exit(2);
}
const { values: args, positionals: selected } = parsed;
if (args.help) {
  process.stdout.write(usage);
  process.exit(0);
}
const maxGroup = Number(args["max-group"]);
if (!Number.isInteger(maxGroup) || maxGroup < 1) {
  process.stderr.write(
    `--max-group must be a positive integer, got '${args["max-group"]}'\n\n${usage}`,
  );
  process.exit(2);
}

// The installed dependency tree, read from the lockfile so results don't
// depend on node_modules being up to date. Each package's entry lists its
// dependencies, including the versions its peers resolved to. Each step
// along a chain of peers is one level deeper in the tree, so the depth is
// unlimited to follow chains of any length. In a workspace, only the root
// project (the first entry) is considered.
const [tree] = JSON.parse(
  execFileSync(
    "pnpm",
    ["list", "--json", "--lockfile-only", "--depth", "Infinity"],
    { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 },
  ),
);

// Lockfile entries for the packages the script considers, keyed by name:
// direct dependencies from the root, and peers from the entry of the package
// that names them. Starts with the direct dependencies; peers are added as
// they're discovered below, once registry metadata says which dependencies
// are peers.
const resolvedEntries = new Map(
  Object.entries({
    ...tree.dependencies,
    ...tree.devDependencies,
    ...tree.optionalDependencies,
  }),
);

// Registries as pnpm is configured to use them, including per-scope ones.
// Auth isn't supported, so private registries will fail to fetch.
const pnpmConfig = JSON.parse(
  execFileSync("pnpm", ["config", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
  }),
);

// Fetch a package's registry metadata: its dist-tags plus an entry for every
// published version (npm calls this document a "packument"). The accept
// header requests the abbreviated form that installers use, which is much
// smaller but still has each version's peerDependencies,
// peerDependenciesMeta and deprecation notice.
function registryFor(name) {
  const scopeRegistry = name.startsWith("@")
    ? pnpmConfig[`${name.split("/")[0]}:registry`]
    : undefined;
  return (
    scopeRegistry ??
    pnpmConfig.registry ??
    "https://registry.npmjs.org/"
  ).replace(/\/?$/, "/");
}

async function fetchRegistryMetadata(name) {
  const res = await fetch(`${registryFor(name)}${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching metadata`);
  return res.json();
}

// Packages left out of the model, with the reason, so the report can say so.
const skipped = new Map();

// Whether a lockfile entry is a package the registry can describe. Aliases
// (`"foo": "npm:bar@1"`) are left out rather than supported: peers name the
// real package, and install commands would need the alias syntax. Linked,
// file, git and tarball dependencies aren't on the registry at all.
function fromRegistry(name, entry) {
  if (entry.from !== name) {
    skipped.set(name, `alias of ${entry.from}`);
  } else if (
    !semver.valid(entry.version) ||
    !entry.resolved?.startsWith(registryFor(name))
  ) {
    skipped.set(name, `not from the registry (${entry.version})`);
  } else {
    return true;
  }
  return false;
}

// A release line (just "line" below) is a set of releases expected to be
// compatible: one major version, or one minor for 0.x versions. Ranks order
// lines numerically, with every 0.x line below 1.
const lineRank = (v) =>
  semver.major(v) > 0 ? semver.major(v) : semver.minor(v) / 1e4;

const satisfiesCache = new Map();
function satisfies(version, range) {
  const key = `${version}\0${range}`;
  if (!satisfiesCache.has(key)) {
    // Let a prerelease satisfy a range its version falls in, e.g. 8.1.0-beta
    // for ^8.0.0. Upgrade candidates are never prereleases, so this only
    // matters for an installed version that is one.
    satisfiesCache.set(
      key,
      semver.satisfies(version, range, { includePrerelease: true }),
    );
  }
  return satisfiesCache.get(key);
}

// --- Load the packages and their candidate versions ---

// Taken before peers are added to resolvedEntries below.
const direct = new Set(
  [...resolvedEntries].filter(([n, e]) => fromRegistry(n, e)).map(([n]) => n),
);

// Every package the solver considers, keyed by name. Each node's
// `candidates` are version entries ({ version, deprecated, rank, peers,
// optional }), split into `base` (the current line) and `upgrades` (later
// lines).
const nodes = new Map();

function buildNode(name, meta) {
  if (!meta) return null;
  const current = resolvedEntries.get(name)?.version;
  const latest = meta["dist-tags"]?.latest;
  if (!current || !latest || !meta.versions[current]) return null;

  const entry = (version) => {
    const v = meta.versions[version];
    return {
      version,
      deprecated: Boolean(v.deprecated),
      rank: lineRank(version),
      peers: v.peerDependencies ?? {},
      optional: new Set(
        Object.entries(v.peerDependenciesMeta ?? {})
          .filter(([, m]) => m.optional)
          .map(([n]) => n),
      ),
    };
  };

  const newestByLine = new Map();
  for (const version of Object.keys(meta.versions)) {
    if (
      semver.prerelease(version) ||
      semver.lt(version, current) ||
      semver.gt(version, latest)
    ) {
      continue;
    }
    // Prefer the newest release on each line that isn't deprecated.
    const rank = lineRank(version);
    const best = newestByLine.get(rank);
    const better = (a, b) =>
      Boolean(meta.versions[a].deprecated) ===
      Boolean(meta.versions[b].deprecated)
        ? semver.gt(a, b)
        : !meta.versions[a].deprecated;
    if (!best || better(version, best)) newestByLine.set(rank, version);
  }
  const versions = new Set([current, ...newestByLine.values()]);
  const candidates = [...versions].sort(semver.compare).map(entry);
  const rank = lineRank(current);

  return {
    name,
    direct: direct.has(name),
    current,
    rank,
    candidates,
    // Versions on the current line. A package outside a group can still take
    // a minor update when the group needs one ("also needs" in the output).
    base: candidates.filter((c) => c.rank === rank),
    upgrades: candidates.filter((c) => c.rank > rank),
  };
}

// Start from the direct dependencies, then repeatedly add the peers that
// some candidate names and the installed version resolved, until no new ones
// turn up. A peer only a newer version needs isn't installed for it yet, so
// it's left out (and reported as a new required peer).
let wave = [...direct];
while (wave.length) {
  const metadata = await Promise.all(
    wave.map((name) =>
      fetchRegistryMetadata(name).catch((e) => {
        skipped.set(name, e.message);
        return null;
      }),
    ),
  );
  const next = new Set();
  wave.forEach((name, i) => {
    const node = buildNode(name, metadata[i]);
    if (!node) return;
    nodes.set(name, node);
    for (const c of node.candidates) {
      for (const peer of Object.keys(c.peers)) {
        const dep = resolvedEntries.get(name).dependencies?.[peer];
        if (!resolvedEntries.has(peer) && dep) {
          resolvedEntries.set(peer, dep);
          if (fromRegistry(peer, dep)) next.add(peer);
        }
      }
    }
  });
  wave = [...next];
}

// --- Peer graph and connected components ---

// Packages are linked when any candidate of one names the other as a peer.
// Only packages in the same component can constrain each other, so the
// solver works one component at a time. Components can be broad (shared
// peers like webpack or postcss join otherwise unrelated tools); the report
// is split into smaller sections later.

const adj = new Map([...nodes.keys()].map((n) => [n, new Set()]));
for (const node of nodes.values()) {
  for (const c of node.candidates) {
    for (const peer of Object.keys(c.peers)) {
      if (nodes.has(peer) && peer !== node.name) {
        adj.get(node.name).add(peer);
        adj.get(peer).add(node.name);
      }
    }
  }
}

const componentOf = new Map();
for (const start of nodes.keys()) {
  if (componentOf.has(start)) continue;
  const comp = [];
  const stack = [start];
  componentOf.set(start, comp);
  while (stack.length) {
    const n = stack.pop();
    comp.push(n);
    for (const m of adj.get(n)) {
      if (!componentOf.has(m)) {
        componentOf.set(m, comp);
        stack.push(m);
      }
    }
  }
}

const latestOf = (node) =>
  node.candidates.findLast((e) => !e.deprecated) ?? node.candidates.at(-1);

// --- Constraint solving ---

// Whether a peer range between two packages is already unmet by their
// installed versions. The solver tolerates these, since otherwise one
// existing violation would make its whole component unsatisfiable; any
// version that changes still has to satisfy the range.
const isCurrent = (name, e) => e.version === nodes.get(name).current;
const unmetNow = [];
for (const [a, na] of nodes) {
  const ea = na.candidates.find((e) => isCurrent(a, e));
  for (const [b, range] of Object.entries(ea.peers)) {
    if (nodes.has(b) && !satisfies(nodes.get(b).current, range)) {
      unmetNow.push(
        `${a}@${na.current} wants ${b}@"${range}", has ${nodes.get(b).current}`,
      );
    }
  }
}

// Enumerate assignments of the component's packages to versions from
// `domains` that satisfy every peer range between them. Calls `onSolution`
// for each and stops after `limit` solutions; returns the number found.
function solve(vars, domains, onSolution = () => {}, limit = 1) {
  const assign = new Map();
  let count = 0;
  const consistent = (name, e) => {
    for (const [other, oe] of assign) {
      if (isCurrent(name, e) && isCurrent(other, oe)) continue;
      const r1 = e.peers[other];
      if (r1 && !satisfies(oe.version, r1)) return false;
      const r2 = oe.peers[name];
      if (r2 && !satisfies(e.version, r2)) return false;
    }
    return true;
  };
  const rec = (i) => {
    if (i === vars.length) {
      count++;
      onSolution(assign);
      return;
    }
    const name = vars[i];
    for (const e of domains.get(name)) {
      if (count >= limit) return;
      if (!consistent(name, e)) continue;
      assign.set(name, e);
      rec(i + 1);
      assign.delete(name);
    }
  };
  rec(0);
  return count;
}

// Domains where `members` move up at least one line and everything else in
// the component stays on its current line. `pinned` fixes specific versions.
function domainsFor(comp, members, pinned = new Map()) {
  return new Map(
    comp.map((n) => {
      if (pinned.has(n)) return [n, [pinned.get(n)]];
      const node = nodes.get(n);
      return [n, members.has(n) ? node.upgrades : node.base];
    }),
  );
}

// Put the most constrained packages first so conflicts are found early.
const varOrder = (comp, first) =>
  [...comp].sort((a, b) =>
    a === first ? -1 : b === first ? 1 : adj.get(b).size - adj.get(a).size,
  );

// The minimal groups that let `target` move to version `entry`. Searches
// breadth-first over sets of packages linked in the peer graph, growing from
// {target}, and skips sets that contain a group already found, so every
// result is minimal. Every result is also valid, but some can be missed:
// only packages linked to the set are tried, so a group whose members are
// connected only through a package that takes a minor update ("also needs")
// isn't found. The search then reports a larger group or none.
function minimalGroups(comp, target, entry) {
  const order = varOrder(comp, target);
  const pinned = new Map([[target, entry]]);
  const key = (s) => [...s].sort().join("\0");
  const found = [];
  const seen = new Set();
  let frontier = [new Set([target])];
  for (let size = 1; size <= maxGroup && frontier.length; size++) {
    const next = [];
    for (const group of frontier) {
      if (found.some((f) => [...f].every((n) => group.has(n)))) continue;
      if (solve(order, domainsFor(comp, group, pinned))) {
        found.push(group);
        continue;
      }
      for (const n of group) {
        for (const m of adj.get(n)) {
          if (group.has(m) || !nodes.get(m).upgrades.length) continue;
          const bigger = new Set([...group, m]);
          const k = key(bigger);
          if (!seen.has(k)) {
            seen.add(k);
            next.push(bigger);
          }
        }
      }
    }
    frontier = next;
  }
  return found;
}

// --- Find stuck packages and the groups that unblock them ---

const stuck = [];
const groups = new Map(); // sorted member names -> { comp, members, targets }

// A direct dependency is stuck when the newest version it can reach on its
// own, with everything else on its current line, is below its latest line.
// Each line above that is a target to search for groups.
for (const node of nodes.values()) {
  if (!node.direct || !node.upgrades.length) continue;
  const comp = componentOf.get(node.name);
  const order = varOrder(comp, node.name);

  const installable = [...node.candidates]
    .reverse()
    .find(
      (e) =>
        (!e.deprecated || e.version === node.current) &&
        solve(order, domainsFor(comp, new Set(), new Map([[node.name, e]]))),
    );
  const latest = latestOf(node);
  if (installable && installable.rank === latest.rank) continue;

  const unresolved = [];
  for (const e of node.upgrades) {
    if (installable && e.rank <= installable.rank) continue;
    const found = minimalGroups(comp, node.name, e);
    if (!found.length) unresolved.push(e);
    for (const members of found) {
      const k = [...members].sort().join("\0");
      if (!groups.has(k)) groups.set(k, { comp, members, targets: [] });
      groups.get(k).targets.push({ name: node.name, entry: e });
    }
  }
  stuck.push({ node, installable, latest, unresolved });
}

// --- Report ---

const pad = (rows) => {
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => r[i].length)),
  );
  return rows.map((r) =>
    r
      .map((c, i) => c.padEnd(widths[i]))
      .join("  ")
      .trimEnd(),
  );
};

if (skipped.size) {
  console.log("Skipped (not in the model):\n");
  for (const line of pad([...skipped].map(([n, why]) => [n, why]))) {
    console.log(`  ${line}`);
  }
  console.log();
}
if (unmetNow.length) {
  console.log(
    "Peer ranges already unmet (ignored unless a version changes):\n",
  );
  for (const u of unmetNow) console.log(`  ${u}`);
  console.log();
}

const lineName = (v) =>
  semver.major(v) > 0 ? `${semver.major(v)}` : `0.${semver.minor(v)}`;
const label = (name, version) =>
  nodes.get(name).candidates.find((e) => e.version === version)?.deprecated
    ? `${version} (deprecated)`
    : version;

// "eslint 9-10, stylelint-order 7" from a list of { name, entry }.
function describeTargets(targets) {
  const byName = Map.groupBy(targets, (t) => t.name);
  return [...byName]
    .map(([name, ts]) => {
      const idx = ts
        .map((t) => nodes.get(name).upgrades.indexOf(t.entry))
        .sort((a, b) => a - b);
      const runs = [];
      for (const i of idx) {
        if (runs.length && runs.at(-1).at(-1) === i - 1) runs.at(-1).push(i);
        else runs.push([i]);
      }
      const ups = nodes.get(name).upgrades;
      const lines = runs.map((r) => {
        const [a, b] = [
          lineName(ups[r[0]].version),
          lineName(ups[r.at(-1)].version),
        ];
        return a === b ? a : `${a}-${b}`;
      });
      return `${name} ${lines.join(", ")}`;
    })
    .join("; ");
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Collapse a list of version tuples into rows of per-column alternatives,
// merging rows that differ in a single column, so independent choices print
// as one row and coupled ones stay separate. Every pick from a row is one of
// the original tuples. Merging is greedy, so the rows aren't necessarily the
// fewest that could cover the tuples.
function combinations(tuples) {
  const unique = [...new Map(tuples.map((t) => [t.join("\0"), t])).values()];
  let rows = unique.map((t) => t.map((v) => new Set([v])));
  const columns = rows[0]?.length ?? 0;
  const cell = (set) => [...set].sort().join("|");
  // Rows that agree on every column but c differ only in c; merge each such
  // bucket into one row. Repeat until a pass over the columns merges nothing.
  for (let merged = true; merged;) {
    merged = false;
    for (let c = 0; c < columns; c++) {
      const buckets = Map.groupBy(rows, (row) =>
        row.map((set, k) => (k === c ? "" : cell(set))).join("\0"),
      );
      if (buckets.size === rows.length) continue;
      merged = true;
      rows = [...buckets.values()].map(([first, ...rest]) => {
        for (const row of rest) for (const v of row[c]) first[c].add(v);
        return first;
      });
    }
  }
  return rows;
}

// A pnpm command installing the newest versions in an option's row. Each row
// is a product of valid choices, so any pick from it is consistent; packages
// outside the group get the oldest versions that work alongside it.
function installCommand(comp, names, row) {
  const pinned = new Map(
    names.map((n, c) => {
      const newest = [...row[c]].sort(semver.compare).at(-1);
      return [n, nodes.get(n).candidates.find((e) => e.version === newest)];
    }),
  );
  let changes;
  solve(
    varOrder(comp, names[0]),
    domainsFor(comp, new Set(names), pinned),
    (assign) => {
      changes = [...assign]
        .filter(([n, e]) => e.version !== nodes.get(n).current)
        .map(([n, e]) => [n, `${n}@${e.version}`])
        .sort(([a], [b]) => a.localeCompare(b));
    },
  );
  // Keep each package in its section of package.json; peers that aren't
  // direct dependencies yet become dev dependencies.
  const flag = (n) =>
    tree.dependencies?.[n]
      ? ""
      : tree.optionalDependencies?.[n]
        ? " -O"
        : " -D";
  return [...Map.groupBy(changes, ([n]) => flag(n))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([f, cs]) => `pnpm add${f} ${cs.map(([, s]) => s).join(" ")}`)
    .join(" && ");
}

// Print a group, or if it extends a smaller `parent` group, just the packages
// it adds and the members whose possible versions differ from the parent's.
function printGroup(group, parent) {
  const { comp, members, targets } = group;
  const names = [...members].sort();
  const tuples = [];
  const nonMemberVersions = new Map(
    comp.filter((n) => !members.has(n)).map((n) => [n, new Set()]),
  );
  const newPeers = new Set();
  const solutionLimit = 100_000;
  const found = solve(
    varOrder(comp, names[0]),
    domainsFor(comp, members),
    (assign) => {
      tuples.push(names.map((n) => assign.get(n).version));
      for (const [n, e] of assign) {
        nonMemberVersions.get(n)?.add(e.version);
        // Required peers that aren't installed yet; pnpm will add them.
        for (const peer of Object.keys(e.peers)) {
          if (!nodes.has(peer) && !e.optional.has(peer)) newPeers.add(peer);
        }
      }
    },
    solutionLimit,
  );

  const options = combinations(tuples);
  group.versions = new Map(
    names.map((n, c) => [n, new Set(options.flatMap((row) => [...row[c]]))]),
  );

  const summary = parent
    ? `Group ${parent.index} + ${names.filter((n) => !parent.members.has(n)).join(", ")}`
    : `${names.length} package(s)`;
  console.log(
    `\n  Group ${group.index}: ${summary}, unblocks ${describeTargets(targets)}`,
  );
  // Pad every option's rows together so the columns line up across options.
  const optionRows = options.map((row) =>
    names
      .map((n, c) => [n, row[c]])
      .filter(
        ([n, vs]) =>
          !parent?.members.has(n) || !sameSet(vs, parent.versions.get(n)),
      )
      .map(([n, vs]) => {
        const sorted = [...vs].sort(semver.compare);
        const latest = latestOf(nodes.get(n));
        return [
          n + (nodes.get(n).direct ? "" : " *"),
          nodes.get(n).current,
          `-> ${sorted.map((v) => label(n, v)).join(" | ")}`,
          lineRank(sorted.at(-1)) < latest.rank
            ? `(latest ${latest.version})`
            : "",
        ];
      }),
  );
  const lines = pad(optionRows.flat());
  optionRows.forEach((rows, o) => {
    const indent = options.length > 1 ? "      " : "    ";
    if (options.length > 1)
      console.log(`    option ${String.fromCharCode(97 + o)}:`);
    for (const line of lines.splice(0, rows.length))
      console.log(`${indent}${line}`);
    if (args.commands)
      console.log(`${indent}$ ${installCommand(comp, names, options[o])}`);
  });

  // Packages outside the group that have to move within their line.
  const minorBumps = [...nonMemberVersions].filter(
    ([n, vs]) => vs.size && !vs.has(nodes.get(n).current),
  );
  if (minorBumps.length) {
    const bumps = minorBumps.map(
      ([n, vs]) => `${n} -> ${[...vs].sort(semver.compare)[0]}`,
    );
    console.log(`    also needs: ${bumps.join(", ")}`);
  }
  if (found >= solutionLimit) {
    console.log(
      `    warning: stopped after ${solutionLimit} combinations; options may be incomplete`,
    );
  }
  if (newPeers.size)
    console.log(`    new required peers: ${[...newPeers].join(", ")}`);
}

// Cluster groups that share a member, so each cluster is a set of upgrades
// that can be planned independently of the others.
const clusters = [];
for (const group of [...groups.values()].sort(
  (a, b) => a.members.size - b.members.size,
)) {
  const overlapping = clusters.filter((c) =>
    c.some((g) => [...g.members].some((n) => group.members.has(n))),
  );
  const merged = [...overlapping.flat(), group];
  for (const c of overlapping) clusters.splice(clusters.indexOf(c), 1);
  clusters.push(merged);
}

const involves = (names) =>
  !selected.length || selected.some((n) => names.has(n));
const shownClusters = clusters.filter((c) =>
  involves(new Set(c.flatMap((g) => [...g.members]))),
);
const shownNames = new Set([
  ...selected,
  ...shownClusters.flatMap((c) => c.flatMap((g) => [...g.members])),
]);
const shownStuck = stuck.filter(
  (s) => !selected.length || shownNames.has(s.node.name),
);

for (const name of selected) {
  if (skipped.has(name)) {
    console.log(`${name} was skipped: ${skipped.get(name)}\n`);
  } else if (!nodes.has(name)) {
    console.log(`${name} is not a dependency\n`);
  } else if (
    !stuck.some((s) => s.node.name === name) &&
    !shownClusters.some((c) => c.some((g) => g.members.has(name)))
  ) {
    console.log(`${name} is not held back by peer dependencies\n`);
  }
}
if (!stuck.length) {
  console.log(
    "No packages are held back from their latest major by peer dependencies.",
  );
}
if (!shownStuck.length) process.exit(0);

console.log(
  "Held back by peer dependencies (newest version installable on its own):\n",
);
for (const line of pad(
  shownStuck.map(({ node, installable, latest }) => [
    node.name,
    node.current,
    installable?.version === node.current
      ? ""
      : `-> ${installable?.version ?? "none"}`,
    `(latest ${latest.version})`,
  ]),
)) {
  console.log(`  ${line}`);
}

for (const cluster of shownClusters) {
  const names = new Set(cluster.flatMap((g) => [...g.members]));
  console.log(
    `\n=== ${stuck
      .filter((s) => names.has(s.node.name))
      .map((s) => s.node.name)
      .join(", ")}`,
  );
  cluster.sort((a, b) => a.members.size - b.members.size);
  cluster.forEach((g, i) => {
    g.index = i + 1;
    const parent = cluster
      .slice(0, i)
      .findLast((p) => [...p.members].every((n) => g.members.has(n)));
    printGroup(g, parent);
  });
}

const unresolved = shownStuck.filter((s) => s.unresolved.length);
if (unresolved.length) {
  console.log(`\nNo group of up to ${maxGroup} packages found for:`);
  for (const s of unresolved) {
    console.log(
      `  ${describeTargets(s.unresolved.map((entry) => ({ name: s.node.name, entry })))}`,
    );
  }
}

if ([...shownNames].some((n) => nodes.has(n) && !nodes.get(n).direct)) {
  console.log("\n* not in package.json; installed as another package's peer");
}
