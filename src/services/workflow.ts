import { OptimizationRequest } from '../types/domain';

export function fingerprintInputs(request: OptimizationRequest): string {
  return JSON.stringify(request);
}

export function resultMatchesInputs(
  solvedInputFingerprint: string | null,
  currentRequest: OptimizationRequest,
): boolean {
  return solvedInputFingerprint !== null &&
    solvedInputFingerprint === fingerprintInputs(currentRequest);
}
