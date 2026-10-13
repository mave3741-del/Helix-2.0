import { evaluatePaperObservation, type PaperObservationCycle, type PaperObservationPolicy, type PaperObservationResult } from '../observation/paper-observation.ts';

export interface LearningAdmissionResult extends PaperObservationResult {
  admitted: boolean;
  reasons: string[];
}

export function evaluateLearningAdmission(cycles: PaperObservationCycle[], policy: PaperObservationPolicy, upstreamHealthy = true): LearningAdmissionResult {
  const observation = evaluatePaperObservation(cycles, policy);
  const reasons = [...observation.reasons];
  if (!upstreamHealthy) reasons.push('upstream_learning_health_not_ready');
  return { ...observation, admitted: reasons.length === 0 && observation.status === 'qualified', reasons };
}
