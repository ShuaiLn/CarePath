/**
 * Metadata-only request logging. The parameter type here is the actual
 * safety property: it structurally has no field for message text or
 * IntakeRecord contents, so nothing sensitive can be passed in even by
 * accident — see docs plan Part 3 "never log the raw message text or full
 * IntakeRecord/currentIntake" and Part 8.5.
 */
export interface RequestLogMetadata {
  route: string
  status: number
  latencyMs: number
}

export function logRequestMetadata(metadata: RequestLogMetadata): void {
  console.log(JSON.stringify(metadata))
}
