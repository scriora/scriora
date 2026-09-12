// scriora-media — Public API
// Mandate: Binary validation, image/video processing,
//          storage abstraction, lifecycle management, document & carousel generation.
// INVARIANT: This package NEVER generates media via AI.
//            AI generation lives in scriora-agent (providers/image, providers/video)
// Reference: scriora-docs/architecture/SCRIORA_MEDIA_FRAMEWORK.md

export * from './contracts/media.contract.js';
export * from './contracts/pdf-carousel.contract.js';
export * from './processors/pdf/pdf-carousel.generator.js';
