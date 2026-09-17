export { parseFigmaTree, mockText, filterInstanceChildren } from './figma/parser.js';
export type { ParseOptions } from './figma/parser.js';

// ---- Phase 4: Advanced verification ----
export { checkBehavioralStates, generateBehavioralReport } from './verify/behavioral.js';
export type { BehavioralCheckOptions, BehavioralResult } from './verify/behavioral.js';

export { evaluateWithVisionAI, visionToDiffResults } from './verify/vision-ai.js';
export type { VisionAIOptions, VisionCriteria, VisionEvaluation } from './verify/vision-ai.js';

export { extractFigmaTokens, extractCodeTokens, matchTokens } from './verify/design-tokens.js';
export type { DesignToken, TokenMatchResult, TokenValidationResult } from './verify/design-tokens.js';
export { normalizeFigmaNode, normalizeFigmaNodes, p3TosRGB } from './figma/normalizer.js';
export { FigmaCache, FigmaAPI } from './figma/cache.js';
export { inspectDOM, setupViewport } from './dom/inspector.js';
export { mockTextContent } from './dom/mock.js';
export { normalizeDOMNode, normalizeDOMNodes, parseColor } from './dom/normalizer.js';
export { diffNodes } from './diff/engine.js';
export { comparePixels } from './diff/pixel.js';
export type { PixelDiffOptions, PixelDiffResult, MismatchRegion } from './diff/pixel.js';
export { compareColor, deltaE2000, colorMatch } from './diff/comparators/color.js';
export { compareLayout } from './diff/comparators/layout.js';
export { compareTypography } from './diff/comparators/typography.js';
export { compareEffects } from './diff/comparators/effects.js';
export { compareAutoLayout } from './diff/comparators/auto-layout.js';
export { hungarianMatch } from './match/matcher.js';
export { calculateScore } from './score/scorer.js';
export { aggregateScores } from './score/aggregator.js';
export { generateCLIReport } from './report/cli-report.js';
export { generateHTMLReport } from './report/html.js';
export { generateFixSuggestions } from './report/fix-suggestions.js';
export { DEFAULT_CONFIG, DEFAULT_TOLERANCES, DEFAULT_WEIGHTS } from './config.js';
export type * from './types.js';
export type { VerifyConfig, ToleranceConfig, WeightConfig } from './config.js';
