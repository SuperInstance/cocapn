/**
 * Knowledge pipeline — git-based model improvement.
 * "Upload footage → model in repo gets better → next clone gets better model."
 */

export { KnowledgePipeline, type KnowledgeEntry, type KnowledgeMeta, type KnowledgeType, type ValidationResult, type KnowledgeStats } from "./pipeline.js";
export { validateFull, validateSpecies, validateRegulation, validateTechnique, validateLocation, validateEquipment } from "./validator.js";
export { GitKnowledgePipeline } from "./git-pipeline.js";
export { extract, suggestType, type ExtractedEntity, type ExtractionResult } from "./extractor.js";
