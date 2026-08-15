import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

type DependencyNode = {
  dependencies?: Record<string, DependencyNode>;
  devDependencies?: Record<string, DependencyNode>;
  resolved?: string;
  version?: string;
};

const root = process.cwd();

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).slice(0, 3).map(Number);
  const rightParts = right.split(/[.-]/).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function collectDependencyVersions(): Map<string, Set<string>> {
  const output = execFileSync(
    "pnpm",
    [
      "list",
      "nanoid",
      "fast-uri",
      "js-yaml",
      "brace-expansion",
      "@babel/core",
      "@opentelemetry/core",
      "uuid",
      "--json",
      "--depth",
      "Infinity",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const versions = new Map<string, Set<string>>();

  function walk(node: DependencyNode): void {
    for (const dependencies of [node.dependencies, node.devDependencies]) {
      for (const [name, dependency] of Object.entries(dependencies ?? {})) {
        assert.match(dependency.resolved ?? "", /^https:\/\/registry\.npmjs\.org\//);
        if (dependency.version) {
          const current = versions.get(name) ?? new Set<string>();
          current.add(dependency.version);
          versions.set(name, current);
        }
        walk(dependency);
      }
    }
  }

  for (const project of JSON.parse(output) as DependencyNode[]) walk(project);
  return versions;
}

test("installed vulnerable dependency families are patched", () => {
  const versions = collectDependencyVersions();
  const floors = new Map<string, string>([
    ["@babel/core", "7.29.6"],
    ["@opentelemetry/core", "2.8.0"],
    ["fast-uri", "3.1.5"],
    ["js-yaml", "4.3.1"],
    ["nanoid", "3.3.18"],
    ["uuid", "11.1.1"],
  ]);

  for (const [name, floor] of floors) {
    for (const installed of versions.get(name) ?? []) {
      assert.ok(compareVersions(installed, floor) >= 0, `${name}@${installed} is below ${floor}`);
    }
  }

  assert.deepEqual([...(versions.get("brace-expansion") ?? [])].sort(), ["1.1.18", "5.0.9"]);
});

test("manifests reject exotic dependency sources", () => {
  const manifest = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const dependencies of [manifest.dependencies, manifest.devDependencies]) {
    for (const specifier of Object.values(dependencies ?? {})) {
      assert.doesNotMatch(specifier, /^(?:git(?:\+|:)|https?:|file:|link:|workspace:)/i);
    }
  }

  const lockfile = readFileSync(`${root}/pnpm-lock.yaml`, "utf8");
  assert.doesNotMatch(lockfile, /\b(?:git\+|github:|https?:|file:|link:|workspace:|tarball:)/i);

  const workspace = readFileSync(`${root}/pnpm-workspace.yaml`, "utf8");
  assert.match(workspace, /^minimumReleaseAge: 10080$/m);
  assert.match(workspace, /^blockExoticSubdeps: true$/m);
});
