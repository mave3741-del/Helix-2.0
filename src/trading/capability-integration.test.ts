import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCapabilityIntegration,
  approveCapabilityIntegration,
  canEnterHelixCore,
  createCapabilityIntegrationRecord,
  deployCapabilityIntegration,
  rejectCapabilityIntegration,
} from "./capability-integration.ts";

const evidence = {
  licenseReviewed: true,
  dataRightsReviewed: true,
  securityReviewed: true,
  testsVerified: true,
  latencyReviewed: true,
  provenanceVerified: true,
  reproducibilityVerified: true,
};

test("capability integration fails closed before complete evidence", () => {
  const record = createCapabilityIntegrationRecord({
    benchmarkId: "qlib",
    sourceRepository: "microsoft/qlib",
    sourceVersion: "v1",
    capability: "quant-research",
    treatment: "reimplement",
    componentName: "factor-research",
    provenance: "benchmark-registry",
  });
  assert.throws(() => assessCapabilityIntegration(record), /license_review_required/);
});

test("capability integration requires all evidence before approval/deployment", () => {
  const record = createCapabilityIntegrationRecord({
    benchmarkId: "lean",
    sourceRepository: "QuantConnect/Lean",
    sourceVersion: "v1",
    capability: "event-driven-engine",
    treatment: "reference",
    componentName: "event-model",
    provenance: "benchmark-registry",
    evidence,
  });
  const assessed = assessCapabilityIntegration(record);
  const approved = approveCapabilityIntegration(assessed);
  const deployed = deployCapabilityIntegration(approved);
  assert.equal(deployed.status, "deployed");
  assert.equal(canEnterHelixCore(deployed), false);
});

test("core deployment is allowed only when explicitly approved", () => {
  const record = createCapabilityIntegrationRecord({
    benchmarkId: "internal-reimplementation",
    sourceRepository: "helix/native",
    sourceVersion: "10.0.0",
    capability: "deterministic-research",
    treatment: "core-component",
    componentName: "research-engine",
    coreDependencyAllowed: true,
    provenance: "helix-review",
    evidence,
  });
  const deployed = deployCapabilityIntegration(approveCapabilityIntegration(assessCapabilityIntegration(record)));
  assert.equal(canEnterHelixCore(deployed), true);
});

test("reference/reimplementation cannot accidentally become a core dependency", () => {
  assert.throws(() => createCapabilityIntegrationRecord({
    benchmarkId: "freqtrade",
    sourceRepository: "freqtrade/freqtrade",
    sourceVersion: "v1",
    capability: "crypto-strategy",
    treatment: "reference",
    componentName: "strategy-lifecycle",
    coreDependencyAllowed: true,
    provenance: "benchmark-registry",
  }), /reference_or_reimplementation_cannot_default_to_core_dependency/);
});

test("deployed capability cannot be rejected directly", () => {
  const record = createCapabilityIntegrationRecord({
    benchmarkId: "openbb",
    sourceRepository: "OpenBB-finance/OpenBB",
    sourceVersion: "v1",
    capability: "financial-data",
    treatment: "adapter",
    componentName: "data-adapter",
    provenance: "benchmark-registry",
    evidence,
  });
  const deployed = deployCapabilityIntegration(approveCapabilityIntegration(assessCapabilityIntegration(record)));
  assert.throws(() => rejectCapabilityIntegration(deployed, "unsafe"), /deployed_capability_requires_rollback/);
});
