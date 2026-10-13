import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuantCapabilityContract,
  getQuantCapabilityRequirement,
  validateQuantCapabilityContract,
} from "./quant-capability-contract.ts";

test("quant capability contract covers Qlib/RD-Agent research lanes", () => {
  const contract = buildQuantCapabilityContract();
  assert.deepEqual(contract.benchmarkIds, ["qlib", "rd-agent-q"]);
  assert.equal(contract.requirements.length, 8);
  assert.equal(validateQuantCapabilityContract(contract), true);
});

test("quant contract is deterministic", () => {
  const first = buildQuantCapabilityContract(["rd-agent-q", "qlib"]);
  const second = buildQuantCapabilityContract(["qlib", "rd-agent-q"]);
  assert.equal(first.contractHash, second.contractHash);
});

test("quant contract rejects tampering", () => {
  const contract = buildQuantCapabilityContract();
  const tampered = { ...contract, benchmarkIds: ["qlib", "rd-agent-q", "other"] };
  assert.equal(validateQuantCapabilityContract(tampered), false);
});

test("all quant requirements remain research/tactical and never live", () => {
  const contract = buildQuantCapabilityContract();
  for (const requirement of contract.requirements) {
    assert.equal(requirement.liveExecutionAllowed, false);
    assert.notEqual(requirement.latencyClass, "fast-path-excluded");
  }
});

test("point-in-time and independent validation are mandatory", () => {
  const contract = buildQuantCapabilityContract();
  assert.equal(contract.requiredSafety.pointInTime, true);
  assert.equal(contract.requiredSafety.independentValidation, true);
  assert.ok(getQuantCapabilityRequirement("model-evaluation").evidenceRequired.includes("walk-forward-manifest"));
});
