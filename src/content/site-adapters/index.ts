import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { perplexityAdapter } from './perplexity';
import { orangeImpactAdapter } from './orange-impact';
import type { SiteAdapter } from './types';

export const ADAPTERS: ReadonlyArray<SiteAdapter> = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  perplexityAdapter,
  orangeImpactAdapter,
];

export function findAdapter(hostname: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(hostname)) ?? null;
}

export {
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  perplexityAdapter,
  orangeImpactAdapter,
};
export type { PasteContext, SiteAdapter } from './types';
