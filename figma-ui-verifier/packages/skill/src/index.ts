/**
 * Claude Code Skill for Figma UI Verification
 *
 * Usage: /figma-verify [options]
 *
 * This skill provides a guided workflow for verifying UI implementations
 * against Figma designs.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SkillOptions {
  figmaJson?: string;
  url?: string;
  threshold?: number;
  viewports?: number[];
  html?: boolean;
  pixel?: boolean;
  skipInstanceChildren?: boolean;
}

/**
 * Main skill entry point
 */
export async function run(options: SkillOptions = {}): Promise<void> {
  console.log('🎨 Figma UI Verification Skill');
  console.log('================================\n');

  // Step 1: Validate inputs
  const config = await validateAndResolveOptions(options);

  // Step 2: Run verification
  console.log('🚀 Running verification...\n');
  const result = runVerification(config);

  // Step 3: Display results
  displayResults(result);

  // Step 4: Provide suggestions
  if (!result.passed) {
    displaySuggestions(result);
  }
}

async function validateAndResolveOptions(options: SkillOptions): Promise<Required<SkillOptions>> {
  const config: Required<SkillOptions> = {
    figmaJson: options.figmaJson ?? '',
    url: options.url ?? 'http://localhost:3000',
    threshold: options.threshold ?? 80,
    viewports: options.viewports ?? [1440],
    html: options.html ?? true,
    pixel: options.pixel ?? false,
    skipInstanceChildren: options.skipInstanceChildren ?? false,
  };

  // Auto-detect Figma JSON
  if (!config.figmaJson) {
    const candidates = [
      'figma-design.json',
      'design.json',
      'figma.json',
      '.figma/design.json',
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        config.figmaJson = candidate;
        console.log(`📁 Found Figma JSON: ${candidate}`);
        break;
      }
    }
  }

  if (!config.figmaJson) {
    console.error('❌ No Figma JSON file found.');
    console.log('   Provide --figma-json <path> or place figma-design.json in project root.');
    process.exit(2);
  }

  if (!existsSync(config.figmaJson)) {
    console.error(`❌ Figma JSON not found: ${config.figmaJson}`);
    process.exit(2);
  }

  return config;
}

interface VerificationResult {
  score: number;
  passed: boolean;
  threshold: number;
  viewportScores: Record<string, number>;
  totalDiffs: number;
  failedDiffs: number;
  suggestions: Array<{
    property: string;
    expected: string;
    actual: string;
    fix: string;
  }>;
}

function runVerification(config: Required<SkillOptions>): VerificationResult {
  const args = [
    `--figma-json ${config.figmaJson}`,
    `--url ${config.url}`,
    `--threshold ${config.threshold}`,
    `--viewports ${config.viewports.join(',')}`,
  ];

  if (config.html) {
    args.push('--html ./figma-verify-report.html');
  }

  if (config.skipInstanceChildren) {
    args.push('--skip-instance-children');
  }

  try {
    const cmd = `npx figma-verify ${args.join(' ')}`;
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (err: unknown) {
    const error = err as { stdout?: string; message?: string };
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        // Fall through
      }
    }
    console.error('❌ Verification failed:', error.message);
    process.exit(2);
  }
}

function displayResults(result: VerificationResult): void {
  const emoji = result.passed ? '✅' : '❌';
  const status = result.passed ? 'PASSED' : 'FAILED';

  console.log(`${emoji} Verification ${status}`);
  console.log(`   Score: ${result.score}/${result.threshold}`);
  console.log(`   Total Diffs: ${result.totalDiffs}`);
  console.log(`   Failed Diffs: ${result.failedDiffs}`);

  if (result.viewportScores) {
    console.log('\n📊 Viewport Scores:');
    for (const [vp, score] of Object.entries(result.viewportScores)) {
      console.log(`   ${vp}px: ${score}`);
    }
  }

  console.log('');
}

function displaySuggestions(result: VerificationResult): void {
  if (result.suggestions.length === 0) return;

  console.log('🔧 Top Fix Suggestions:\n');

  const topSuggestions = result.suggestions.slice(0, 5);
  for (const suggestion of topSuggestions) {
    console.log(`   • ${suggestion.property}: ${suggestion.actual} → ${suggestion.expected}`);
    console.log(`     ${suggestion.fix}`);
  }

  if (result.suggestions.length > 5) {
    console.log(`\n   ... and ${result.suggestions.length - 5} more suggestions`);
  }

  console.log('\n📄 Full report: ./figma-verify-report.html');
}

/**
 * Skill metadata for Claude Code
 */
export const metadata = {
  name: 'figma-verify',
  description: 'Verify UI implementation against Figma design',
  usage: '/figma-verify [--figma-json <path>] [--url <url>] [--threshold <number>]',
  examples: [
    '/figma-verify',
    '/figma-verify --figma-json ./design.json --url http://localhost:3000',
    '/figma-verify --threshold 90 --viewports 1440,768,375',
  ],
};

export default { run, metadata };