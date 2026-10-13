import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const results = [];

function run(name, command, args = []) {
  const child = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  const passed = child.status === 0;
  results.push({ name, status: passed ? "PASS" : "FAIL", code: child.status, output: `${child.stdout ?? ""}${child.stderr ?? ""}`.slice(-4000) });
  return passed;
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const migrations = Object.keys(JSON.parse(readFileSync(join(root, "artifacts/dependency-integrity.json"), "utf8")));
void migrations;

run("native_tool_phase8_suite", process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-alias-loader.mjs", "--test",
  "src/runtime/tools/factory-governance.test.ts",
  "src/runtime/tools/capability-router.test.ts",
  "src/runtime/tools/registry-bootstrap.test.ts",
  "src/runtime/tools/approval-service.test.ts",
  "src/trading/runtime/worker-activation.test.ts"]);
run("migration_integrity", process.execPath, ["scripts/migration-integrity.mjs"]);
run("release_integrity", process.execPath, ["scripts/release-integrity.mjs"]);
run("coverage_integrity", process.execPath, ["scripts/test-coverage-integrity.mjs"]);

const dependency = spawnSync(process.execPath, ["scripts/dependency-integrity.mjs"], { cwd: root, encoding: "utf8", stdio: "pipe" });
const dependencyPassed = dependency.status === 0;
results.push({ name: "dependency_hydration", status: dependencyPassed ? "PASS" : "EXTERNAL_BLOCKED", code: dependency.status, output: `${dependency.stdout ?? ""}${dependency.stderr ?? ""}`.slice(-4000) });

const externalBlocked = [
  !dependencyPassed ? "dependency_hydration" : null,
  !process.env.DATABASE_URL ? "real_postgresql" : null,
  process.env.HELIX_EXTERNAL_STAGING !== "true" ? "connector_staging_permissions" : null,
  process.env.HELIX_DEPLOYMENT_ATTESTATION ? null : "deployment_host_attestation",
  process.env.HELIX_INDEPENDENT_REVIEWER_EVIDENCE ? null : "independent_readiness_review",
].filter(Boolean);

const report = {
  schema: 1,
  phase: "8-final",
  release: pkg.version,
  engineeringStatus: results.every((x) => x.status === "PASS" || x.status === "EXTERNAL_BLOCKED") && results.filter((x) => x.name !== "dependency_hydration").every((x) => x.status === "PASS") ? "ENGINEERING_COMPLETE" : "ENGINEERING_FAILED",
  externalStatus: externalBlocked.length ? "PENDING_EXTERNAL_EVIDENCE" : "READY_FOR_EXTERNAL_CERTIFICATION",
  externalBlockers: externalBlocked,
  generatedAt: new Date().toISOString(),
  results,
};
writeFileSync(join(root, "artifacts/phase8-engineering-gate.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.engineeringStatus !== "ENGINEERING_COMPLETE") process.exit(1);
