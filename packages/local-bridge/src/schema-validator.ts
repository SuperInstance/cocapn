/**
 * SchemaValidator — validates config/agent YAML against the JSON Schemas in /schemas/.
 *
 * Loaded lazily so the bridge starts quickly; first validation call triggers schema load.
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Use require() for CJS-only packages that have no ESM export map under NodeNext
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const Ajv = require("ajv");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const addFormats = require("ajv-formats");

import type { ValidateFunction, ErrorObject } from "ajv";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Schemas live at packages/local-bridge/../../schemas/ relative to this file
const SCHEMAS_DIR = resolve(__dirname, "../../../schemas");

export type ValidationErrors = ErrorObject[] | null;

// Minimal shape we need from an Ajv instance
interface AjvLike {
  compile(schema: object): ValidateFunction;
}

export class SchemaValidator {
  private ajv: AjvLike;
  private validators = new Map<string, ValidateFunction>();

  constructor() {
    // Ajv v8 CJS default export is the class itself
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const AjvClass = (Ajv as { default?: unknown }).default ?? Ajv;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.ajv = new (AjvClass as new (opts: object) => AjvLike)({
      allErrors: true,
      strict: false,
    });
    // ajv-formats may export via .default under CJS interop
    const applyFormats = (addFormats as { default?: (ajv: AjvLike) => void }).default
      ?? (addFormats as unknown as (ajv: AjvLike) => void);
    applyFormats(this.ajv);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  validatePublicConfig(data: unknown): ValidationErrors {
    return this.validate("cocapn-public.schema.json", data);
  }

  validatePrivateConfig(data: unknown): ValidationErrors {
    return this.validate("cocapn-private.schema.json", data);
  }

  validateAgentDefinition(data: unknown): ValidationErrors {
    return this.validate("agent-definition.schema.json", data);
  }

  validateModuleManifest(data: unknown): ValidationErrors {
    return this.validate("module-manifest.schema.json", data);
  }

  validateMemoryFact(data: unknown): ValidationErrors {
    return this.validate("memory-fact.schema.json", data);
  }

  validateA2AAgentCard(data: unknown): ValidationErrors {
    return this.validate("a2a-agent-card.schema.json", data);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private validate(schemaFile: string, data: unknown): ValidationErrors {
    const fn = this.getOrLoadValidator(schemaFile);
    if (!fn) return null; // Schema not found — skip validation

    const valid = fn(data);
    if (valid) return null;
    return fn.errors ?? null;
  }

  private getOrLoadValidator(schemaFile: string): ValidateFunction | undefined {
    if (this.validators.has(schemaFile)) {
      return this.validators.get(schemaFile);
    }

    const schemaPath = join(SCHEMAS_DIR, schemaFile);
    if (!existsSync(schemaPath)) {
      console.warn(`[schema] Schema not found: ${schemaPath}`);
      return undefined;
    }

    try {
      const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
      const fn = this.ajv.compile(schema);
      this.validators.set(schemaFile, fn);
      return fn;
    } catch (err) {
      console.warn(`[schema] Failed to compile ${schemaFile}:`, err);
      return undefined;
    }
  }
}
