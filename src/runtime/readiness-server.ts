import { createServerFn } from "@tanstack/react-start";
import { getServerRuntime } from "./trading-runtime-singleton";
import type { ReadinessReport } from "@/trading/readiness";

export const getReadinessReport = createServerFn({ method: "GET" }).handler(async (): Promise<ReadinessReport> => {
  const runtime = await getServerRuntime();
  return runtime.readinessReport();
});
