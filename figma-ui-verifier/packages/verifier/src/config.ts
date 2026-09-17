import type { DiffCategory } from './types.js';

export interface ToleranceConfig {
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: {
    deltaE2000: number;
    r: number; g: number; b: number; a: number;
  };
  fontSize: number;
  borderRadius: number;
  spacing: number;
  opacity: number;
  rotation: number;
}

export interface WeightConfig extends Record<DiffCategory, number> {
  completeness: number;
  position_size: number;
  color_style: number;
  typography: number;
  layout_properties: number;
}

export interface VerifyConfig {
  tolerances: ToleranceConfig;
  weights: WeightConfig;
  threshold: number;
  includeHiddenNodes: boolean;
  ciGateEnabled: boolean;
}

export const DEFAULT_TOLERANCES: ToleranceConfig = {
  position: { x: 2, y: 2 },
  size: { width: 2, height: 2 },
  color: { deltaE2000: 3.0, r: 5, g: 5, b: 5, a: 0.02 },
  fontSize: 1,
  borderRadius: 1,
  spacing: 2,
  opacity: 0.02,
  rotation: 1,
};

export const DEFAULT_WEIGHTS: WeightConfig = {
  completeness: 0.10,
  position_size: 0.25,
  color_style: 0.20,
  typography: 0.20,
  layout_properties: 0.25,
};

export const DEFAULT_CONFIG: VerifyConfig = {
  tolerances: DEFAULT_TOLERANCES,
  weights: DEFAULT_WEIGHTS,
  threshold: 80,
  includeHiddenNodes: false,
  ciGateEnabled: true,
};
