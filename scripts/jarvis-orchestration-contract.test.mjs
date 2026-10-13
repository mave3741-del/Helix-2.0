import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("JARVIS UI contract exposes the requested named identities", async () => {
  const source = await read("src/runtime/jarvis/orchestrator-core.ts");
  for (const name of ["Orion", "Lyra", "Nova", "Atlas", "Polaris", "Nebula", "Titan", "Cassini", "Astra", "Mira", "Selene"]) {
    assert.match(source, new RegExp(`name: \\"${name}\\"`));
  }
});

test("NVIDIA NIM is a first-class configurable brain provider", async () => {
  const source = await read("src/runtime/brain/providers.ts");
  assert.match(source, /id: "nvidia-nim"/);
  assert.ok(source.includes("https://integrate.api.nvidia.com/v1"));
  assert.match(source, /envKey: "NVIDIA_API_KEY"/);
  assert.ok(source.includes('"nvidia-nim": "nvidia-nim"'));
});

test("Voice composer dispatches final speech transcripts into orchestration", async () => {
  const source = await read("src/components/helix/voice-composer.tsx");
  assert.match(source, /onVoiceSubmit\?: \(value: string\) => void/);
  assert.match(source, /onVoiceSubmit\?\.\(finalTranscript\)/);
  const command = await read("src/components/views/command-view.tsx");
  assert.match(command, /onVoiceSubmit=\{\(value\) => void submit\(value, true\)\}/);
});

test("Command UI does not expose the generic CEO label", async () => {
  const [command, orchestrator] = await Promise.all([
    read("src/components/views/command-view.tsx"),
    read("src/runtime/jarvis/orchestrator.ts"),
  ]);
  assert.equal(/>\s*CEO\s*</i.test(command), false);
  assert.equal(/"CEO"|\bCEO:/i.test(orchestrator), false);
});

test("JARVIS orchestration is part of the project test contract", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.match(pkg.scripts.test, /jarvis\/orchestrator\.test\.ts/);
  assert.match(pkg.scripts.test, /jarvis-orchestration-contract\.test\.mjs/);
});
