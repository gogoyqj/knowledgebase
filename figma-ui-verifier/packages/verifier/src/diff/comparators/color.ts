import type { NormalizedNode, DiffResult, RGBAColor } from '../../types.js';
import type { ToleranceConfig } from '../../config.js';

/**
 * 颜色对比器：CIEDE2000 感知色差
 */
export function compareColor(
  expected: NormalizedNode,
  actual: NormalizedNode,
  tolerances: ToleranceConfig,
): DiffResult[] {
  const results: DiffResult[] = [];

  // Background color
  if (expected.backgroundColor) {
    const actualBg = actual.backgroundColor;
    if (!actualBg) {
      results.push(makeFail(expected, 'background-color', expected.backgroundColor, 'none', tolerances));
    } else {
      const pass = colorMatch(expected.backgroundColor, actualBg, tolerances.color);
      results.push({
        nodeId: expected.id,
        nodeName: expected.name,
        category: 'color_style',
        property: 'background-color',
        expected: expected.backgroundColor,
        actual: actualBg,
        pass,
        diff: pass ? undefined : `deltaE2000=${deltaE2000(expected.backgroundColor, actualBg).toFixed(2)}`,
        fix: pass ? undefined : `set background-color to rgba(${expected.backgroundColor.r},${expected.backgroundColor.g},${expected.backgroundColor.b},${expected.backgroundColor.a})`,
      });
    }
  }

  // Border color
  if (expected.borderColor) {
    const actualBc = actual.borderColor;
    if (!actualBc) {
      results.push(makeFail(expected, 'border-color', expected.borderColor, 'none', tolerances));
    } else {
      const pass = colorMatch(expected.borderColor, actualBc, tolerances.color);
      results.push({
        nodeId: expected.id,
        nodeName: expected.name,
        category: 'color_style',
        property: 'border-color',
        expected: expected.borderColor,
        actual: actualBc,
        pass,
        diff: pass ? undefined : `deltaE2000=${deltaE2000(expected.borderColor, actualBc).toFixed(2)}`,
        fix: pass ? undefined : `set border-color to rgba(${expected.borderColor.r},${expected.borderColor.g},${expected.borderColor.b},${expected.borderColor.a})`,
      });
    }
  }

  // Opacity
  if (expected.opacity != null) {
    const actualOp = actual.opacity ?? 1;
    const pass = Math.abs(expected.opacity - actualOp) <= tolerances.opacity;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'color_style',
      property: 'opacity',
      expected: expected.opacity,
      actual: actualOp,
      pass,
      diff: pass ? undefined : `Δ${(expected.opacity - actualOp).toFixed(3)}`,
      fix: pass ? undefined : `set opacity to ${expected.opacity}`,
    });
  }

  return results;
}

function makeFail(
  node: NormalizedNode,
  prop: string,
  expected: unknown,
  actual: unknown,
  _tolerances: ToleranceConfig,
): DiffResult {
  return {
    nodeId: node.id,
    nodeName: node.name,
    category: 'color_style',
    property: prop,
    expected,
    actual,
    pass: false,
    fix: `set ${prop} to match design`,
  };
}

/**
 * 颜色匹配：优先 CIEDE2000，降级到放宽的 RGB
 */
export function colorMatch(
  expected: RGBAColor,
  actual: RGBAColor,
  tolerances: ToleranceConfig['color'],
): boolean {
  // Alpha 检查
  if (Math.abs(expected.a - actual.a) > tolerances.a) return false;

  // CIEDE2000
  const de = deltaE2000(expected, actual);
  if (de <= tolerances.deltaE2000) return true;

  // 降级：放宽的 RGB
  return (
    Math.abs(expected.r - actual.r) <= tolerances.r &&
    Math.abs(expected.g - actual.g) <= tolerances.g &&
    Math.abs(expected.b - actual.b) <= tolerances.b
  );
}

/**
 * sRGB → Lab → CIEDE2000 色差计算
 */
export function deltaE2000(c1: RGBAColor, c2: RGBAColor): number {
  const lab1 = rgbToLab(c1.r, c1.g, c1.b);
  const lab2 = rgbToLab(c2.r, c2.g, c2.b);
  return calcDeltaE2000(lab1, lab2);
}

// --- CIEDE2000 Implementation ---

interface Lab { L: number; a: number; b: number }

function rgbToLab(r: number, g: number, b: number): Lab {
  // sRGB → linear
  let lr = r / 255, lg = g / 255, lb = b / 255;
  lr = lr > 0.04045 ? Math.pow((lr + 0.055) / 1.055, 2.4) : lr / 12.92;
  lg = lg > 0.04045 ? Math.pow((lg + 0.055) / 1.055, 2.4) : lg / 12.92;
  lb = lb > 0.04045 ? Math.pow((lb + 0.055) / 1.055, 2.4) : lb / 12.92;

  // linear RGB → XYZ (D65)
  let x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  let y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / 1.00000;
  let z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

  // XYZ → Lab
  const e = 0.008856;
  const k = 903.3;
  x = x > e ? Math.cbrt(x) : (k * x + 16) / 116;
  y = y > e ? Math.cbrt(y) : (k * y + 16) / 116;
  z = z > e ? Math.cbrt(z) : (k * z + 16) / 116;

  return {
    L: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

function calcDeltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const kL = 1, kC = 1, kH = 1;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;
  const Cab7 = Math.pow(Cab, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + Math.pow(25, 7))));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * hp * Math.PI / 180)
    + 0.32 * Math.cos((3 * hp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hp - 63) * Math.PI / 180);

  const Cp7 = Math.pow(Cp, 7);
  const SL = 1 + 0.015 * Math.pow(Lp - 50, 2) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7_257 = Cp7 / (Cp7 + Math.pow(25, 7));
  const RT = -2 * Math.sqrt(Cp7_257)
    * Math.sin(60 * Math.exp(-Math.pow((hp - 275) / 25, 2)) * Math.PI / 180);

  return Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );
}
