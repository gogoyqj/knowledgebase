import type { NormalizedNode, DiffResult } from '../types.js';

export interface VisionAIOptions {
  /** API endpoint for vision model */
  apiEndpoint?: string;
  /** API key for vision model */
  apiKey?: string;
  /** Model to use (e.g., 'gpt-4o', 'claude-3-opus') */
  model?: string;
  /** Evaluation criteria */
  criteria?: VisionCriteria[];
}

export interface VisionCriteria {
  name: string;
  description: string;
  weight: number;
}

export interface VisionEvaluation {
  score: number;
  criteria: Record<string, number>;
  feedback: string;
  suggestions: string[];
}

const DEFAULT_CRITERIA: VisionCriteria[] = [
  {
    name: 'visual_hierarchy',
    description: 'Visual hierarchy and information architecture clarity',
    weight: 0.25,
  },
  {
    name: 'spacing_consistency',
    description: 'Consistent spacing and alignment patterns',
    weight: 0.20,
  },
  {
    name: 'color_harmony',
    description: 'Color scheme harmony and contrast',
    weight: 0.20,
  },
  {
    name: 'typography_readability',
    description: 'Typography readability and hierarchy',
    weight: 0.20,
  },
  {
    name: 'overall_polish',
    description: 'Overall visual polish and professionalism',
    weight: 0.15,
  },
];

/**
 * Evaluate visual quality using Vision AI models.
 * Compares Figma design screenshot with DOM screenshot.
 */
export async function evaluateWithVisionAI(
  figmaScreenshot: Buffer,
  domScreenshot: Buffer,
  options?: VisionAIOptions,
): Promise<VisionEvaluation> {
  const opts = {
    apiEndpoint: options?.apiEndpoint ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    model: options?.model ?? 'gpt-4o',
    criteria: options?.criteria ?? DEFAULT_CRITERIA,
  };

  if (!opts.apiKey) {
    return {
      score: 0,
      criteria: {},
      feedback: 'Vision AI evaluation skipped: no API key provided',
      suggestions: [],
    };
  }

  const prompt = buildEvaluationPrompt(opts.criteria);
  const figmaBase64 = figmaScreenshot.toString('base64');
  const domBase64 = domScreenshot.toString('base64');

  try {
    const response = await fetch(opts.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'text', text: '\n\nFigma Design:' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${figmaBase64}` } },
              { type: 'text', text: '\n\nImplemented UI:' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${domBase64}` } },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    return parseEvaluationResponse(content, opts.criteria);
  } catch (err) {
    return {
      score: 0,
      criteria: {},
      feedback: `Vision AI evaluation failed: ${err}`,
      suggestions: [],
    };
  }
}

function buildEvaluationPrompt(criteria: VisionCriteria[]): string {
  return `You are a UI/UX expert evaluating the fidelity of a web implementation against its Figma design.

Please evaluate the implementation on these criteria (score 0-100 each):
${criteria.map(c => `- ${c.name}: ${c.description}`).join('\n')}

Respond in this exact JSON format:
{
  "criteria": {
    ${criteria.map(c => `"${c.name}": <score 0-100>`).join(',\n    ')}
  },
  "feedback": "<overall feedback in 2-3 sentences>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"]
}`;
}

function parseEvaluationResponse(
  content: string,
  criteria: VisionCriteria[],
): VisionEvaluation {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      criteria?: Record<string, number>;
      feedback?: string;
      suggestions?: string[];
    };

    const criteriaScores = parsed.criteria ?? {};
    const weightedScore = criteria.reduce((sum, c) => {
      const score = criteriaScores[c.name] ?? 0;
      return sum + score * c.weight;
    }, 0);

    return {
      score: Math.round(weightedScore * 10) / 10,
      criteria: criteriaScores,
      feedback: parsed.feedback ?? '',
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return {
      score: 0,
      criteria: {},
      feedback: 'Failed to parse Vision AI response',
      suggestions: [],
    };
  }
}

/**
 * Convert Vision AI evaluation to DiffResults for integration with scoring
 */
export function visionToDiffResults(evaluation: VisionEvaluation): DiffResult[] {
  const results: DiffResult[] = [];

  for (const [criterion, score] of Object.entries(evaluation.criteria)) {
    results.push({
      nodeId: 'vision-ai',
      nodeName: 'Vision AI Evaluation',
      category: 'color_style',
      property: `vision:${criterion}`,
      expected: 100,
      actual: score,
      pass: score >= 70,
      diff: `Vision AI score: ${score}/100`,
    });
  }

  return results;
}