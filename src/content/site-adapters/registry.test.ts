import { describe, expect, test } from 'vitest';
import { findAdapter, ADAPTERS } from './index';

describe('findAdapter', () => {
  test('chatgpt.com → chatgpt 어댑터', () => {
    expect(findAdapter('chatgpt.com')?.id).toBe('chatgpt');
  });

  test('chat.openai.com → chatgpt 어댑터', () => {
    expect(findAdapter('chat.openai.com')?.id).toBe('chatgpt');
  });

  test('claude.ai → claude 어댑터', () => {
    expect(findAdapter('claude.ai')?.id).toBe('claude');
  });

  test('gemini.google.com → gemini 어댑터', () => {
    expect(findAdapter('gemini.google.com')?.id).toBe('gemini');
  });

  test('perplexity.ai 및 www.perplexity.ai → perplexity 어댑터', () => {
    expect(findAdapter('perplexity.ai')?.id).toBe('perplexity');
    expect(findAdapter('www.perplexity.ai')?.id).toBe('perplexity');
  });

  test('orangeimpact.kr 및 staging.orangeimpact.kr → orange-impact 어댑터', () => {
    expect(findAdapter('orangeimpact.kr')?.id).toBe('orange-impact');
    expect(findAdapter('staging.orangeimpact.kr')?.id).toBe('orange-impact');
  });

  test('관계없는 도메인은 null', () => {
    expect(findAdapter('example.com')).toBe(null);
    expect(findAdapter('google.com')).toBe(null);
    expect(findAdapter('openai.com')).toBe(null); // root만 (ChatGPT는 chat.openai.com)
  });

  test('호스트 일부 일치(suffix abuse) 방어', () => {
    // 'evil-claude.ai'가 claude.ai와 매칭되면 안 됨
    expect(findAdapter('evilclaude.ai')).toBe(null);
    expect(findAdapter('not-chatgpt.com')).toBe(null);
  });

  test('레지스트리에 5개 어댑터 등록', () => {
    expect(ADAPTERS).toHaveLength(5);
    expect(ADAPTERS.map((a) => a.id).sort()).toEqual(
      ['chatgpt', 'claude', 'gemini', 'orange-impact', 'perplexity'].sort(),
    );
  });
});
