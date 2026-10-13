import { InMemoryDebateStore, SqlDebateStore, DebateCoordinator, type DebateStore } from "../debate.ts";
import { InMemoryEvidenceStore, SqlEvidenceStore, type EvidenceStore } from "../evidence.ts";
import { InMemoryWorkerReasoningTraceStore, SqlWorkerReasoningTraceStore, type WorkerReasoningTraceStore } from "./reasoning-store.ts";
import { InMemoryTaskResultStore, SqlTaskResultStore, type TaskResultStore } from "./task-results.ts";
import { InMemoryTradingWorkerRegistry, SqlTradingWorkerRegistry, type TradingWorkerRegistry } from "./worker-registry.ts";
import { InMemoryTaskQueue, SqlTaskQueue, type TaskQueue } from "./task-queue.ts";
import { TradingEventWorkerRouter, type EventWorkerRouterOptions } from "./event-worker-router.ts";
import { TradingWorkerSupervisor, type SupervisorRunStats, type WorkerSupervisorOptions } from "./worker-supervisor.ts";
import { TradingWorkerTaskEngine, type WorkerReasoningProvider } from "./worker-execution.ts";
import { TradingEventBus } from "./event-bus.ts";
import { GovernedNativeToolRuntime } from "../../runtime/tools/registry-bootstrap.ts";
import { InMemoryNativeToolRegistryStore, SqlNativeToolRegistryStore, advanceNativeToolLifecycle, builtInTradingTools, createNativeToolRegistry, registerNativeTool, type NativeToolRegistryStore } from "../../runtime/tools/factory.ts";
import { DeploymentAdmissionGate, type DeploymentAdmissionRequest } from "../../runtime/certification/deployment-admission.ts";
import { InMemoryDeploymentAdmissionObservationStore, SqlDeploymentAdmissionObservationStore, createDeploymentAdmissionObservation, type DeploymentAdmissionObservationStore } from "../../runtime/certification/deployment-admission-observation.ts";

export interface TradingWorkerActivationOptions {
  queue?: TaskQueue;
  router?: TradingEventWorkerRouter;
  registry?: TradingWorkerRegistry;
  results?: TaskResultStore;
  evidence?: EvidenceStore;
  debateStore?: DebateStore;
  reasoningStore?: WorkerReasoningTraceStore;
  reasoning?: WorkerReasoningProvider;
  routerOptions?: EventWorkerRouterOptions;
  supervisorOptions?: WorkerSupervisorOptions;
  nativeToolStore?: NativeToolRegistryStore;
  nativeToolSeedMissingBuiltIns?: boolean;
  deploymentAdmission?: { gate: DeploymentAdmissionGate; request: DeploymentAdmissionRequest; observations?: DeploymentAdmissionObservationStore };
}

/**
 * Explicitly starts the server-side worker execution loop for the existing
 * durable event/task boundary. It never enables live trading and never auto-starts.
 */
export class TradingWorkerActivationService {
  readonly router: TradingEventWorkerRouter;
  readonly supervisor: TradingWorkerSupervisor;
  readonly taskEngine: TradingWorkerTaskEngine;
  readonly nativeToolRuntime: GovernedNativeToolRuntime;
  private readonly deploymentAdmission?: { gate: DeploymentAdmissionGate; request: DeploymentAdmissionRequest; observations: DeploymentAdmissionObservationStore };

  constructor(input: { events: TradingEventBus; options?: TradingWorkerActivationOptions }) {
    const options = input.options ?? {};
    const queue = options.queue ?? new SqlTaskQueue();
    const registry = options.registry ?? new SqlTradingWorkerRegistry();
    const results = options.results ?? new SqlTaskResultStore();
    const evidence = options.evidence ?? new SqlEvidenceStore();
    const debateStore = options.debateStore ?? new SqlDebateStore();
    const reasoningStore = options.reasoningStore ?? new SqlWorkerReasoningTraceStore();
    const nativeToolStore = options.nativeToolStore ?? new SqlNativeToolRegistryStore();
    this.nativeToolRuntime = new GovernedNativeToolRuntime(nativeToolStore, { seedMissingBuiltIns: options.nativeToolSeedMissingBuiltIns });
    this.deploymentAdmission = options.deploymentAdmission
      ? {
          gate: options.deploymentAdmission.gate,
          request: options.deploymentAdmission.request,
          observations: options.deploymentAdmission.observations ?? new SqlDeploymentAdmissionObservationStore(),
        }
      : undefined;

    const debates = new DebateCoordinator(debateStore, registry, queue);
    this.taskEngine = new TradingWorkerTaskEngine({
      evidence,
      debates,
      reasoning: options.reasoning,
      reasoningStore,
      nativeRuntime: this.nativeToolRuntime,
    });
    this.router = options.router ?? new TradingEventWorkerRouter({ events: input.events, queue, options: options.routerOptions });
    this.supervisor = new TradingWorkerSupervisor({
      queue,
      registry,
      results,
      executor: (context) => this.taskEngine.execute(context),
      options: options.supervisorOptions,
    });
  }

  async bootstrap(now = Date.now()): Promise<number> {
    if (this.deploymentAdmission) {
      const request = { ...this.deploymentAdmission.request, now };
      const result = await this.deploymentAdmission.gate.evaluate(request);
      const observation = createDeploymentAdmissionObservation({
        deploymentId: request.deploymentId,
        appVersion: request.appVersion,
        attestation: request.attestation,
        result,
        evaluatedAt: now,
      });
      try {
        await this.deploymentAdmission.observations.append(observation);
      } catch (error) {
        throw new Error(`deployment_admission_observation_unavailable:${error instanceof Error ? error.message : 'unknown'}`);
      }
      if (!result.allowed) throw new Error(`deployment_admission_blocked:${result.reasons.join(',')}`);
    }
    const state = await this.nativeToolRuntime.reconcile();
    if (state.drifted.length || state.blocked.length) {
      throw new Error(`native_tool_runtime_blocked:${[...state.drifted, ...state.blocked].sort().join(",")}`);
    }
    return this.supervisor.bootstrap(now);
  }

  async runOnce(now = Date.now()): Promise<SupervisorRunStats> {
    return this.supervisor.runOnce(now);
  }

  start(pollMs = 250): void {
    this.supervisor.start(pollMs);
  }

  async stop(): Promise<void> {
    await this.supervisor.stop();
  }

  isStarted(): boolean {
    return this.supervisor.isStarted();
  }

  close(): void {
    this.router.close();
  }
}

export function createInMemoryTradingWorkerActivation(input: { events: TradingEventBus; reasoning?: WorkerReasoningProvider; routerOptions?: EventWorkerRouterOptions; supervisorOptions?: WorkerSupervisorOptions } = { events: new TradingEventBus() }): TradingWorkerActivationService {
  return new TradingWorkerActivationService({
    events: input.events,
    options: {
      queue: new InMemoryTaskQueue(),
      registry: new InMemoryTradingWorkerRegistry(),
      results: new InMemoryTaskResultStore(),
      evidence: new InMemoryEvidenceStore(),
      debateStore: new InMemoryDebateStore(),
      reasoningStore: new InMemoryWorkerReasoningTraceStore(),
      reasoning: input.reasoning,
      routerOptions: input.routerOptions,
      supervisorOptions: input.supervisorOptions,
      nativeToolStore: new InMemoryNativeToolRegistryStore(),
      nativeToolSeedMissingBuiltIns: true,
      deploymentAdmission: undefined,
    },
  });
}
