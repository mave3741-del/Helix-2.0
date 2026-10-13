import { createFileRoute } from "@tanstack/react-router";
import { PaperDeskView } from "@/components/views/paper-desk-view";

export const Route = createFileRoute("/paper-desk")({ component: PaperDeskView });
