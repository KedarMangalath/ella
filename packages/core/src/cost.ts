const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7":           { input: 15.00, output: 75.00 },
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00  },
  "o3":                        { input: 10.00, output: 40.00 },
  "o4-mini":                   { input: 1.10,  output: 4.40  },
  "gpt-4o":                    { input: 2.50,  output: 10.00 },
  "gemini-2.5-pro":            { input: 1.25,  output: 10.00 },
  "gemini-2.5-flash":          { input: 0.15,  output: 0.60  },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.000";
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
