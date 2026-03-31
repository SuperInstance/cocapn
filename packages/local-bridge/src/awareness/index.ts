/**
 * Awareness module — first-person repo perception.
 *
 * The agent's ability to understand itself through its repository.
 * Import this barrel to get all awareness submodules.
 */

export { RepoSelf } from './repo-self.js';
export { BodySchemaMapper } from './body-schema.js';
export { VisitorAwareness } from './visitor.js';
export { TimeSense } from './time-sense.js';
export type {
  SelfDescription,
  RepoBody,
  RepoMemory,
  GrowthPattern,
  GrowthPhase,
  Reflection,
  VisitorType,
  Visitor,
  Greeting,
  VisitorRecord,
  TemporalState,
  BodyPartMapping,
  BodySchema,
} from './types.js';
