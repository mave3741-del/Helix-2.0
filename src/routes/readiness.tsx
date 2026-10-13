import { createFileRoute } from "@tanstack/react-router";
import { ReadinessView } from "@/components/views/readiness-view";

export const Route = createFileRoute("/readiness")({ component: ReadinessView });
