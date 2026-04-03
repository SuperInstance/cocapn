/**
 * Cocapn SDK — repo-native agent framework.
 *
 * Import this to turn any repo into a Cocapn vessel:
 *   import { CocapnAgent, Vessel, Fleet } from './sdk';
 *
 * @author Superinstance & Lucineer (DiGennaro et al.)
 * @version 0.1.0
 */

// Types
export type { Tile, Pattern, VesselManifest, FleetMessage, RunMetrics } from './types.js';
export { SDK_VERSION, PROTOCOL_VERSION } from './types.js';

// Core classes
export { CocapnAgent } from './agent.js';
export { Vessel } from './vessel.js';
export { Fleet } from './fleet.js';
