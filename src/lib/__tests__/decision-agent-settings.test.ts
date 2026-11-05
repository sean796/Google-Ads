import { describe, expect, it, beforeEach } from 'vitest';
import {
  getDecisionModel,
  DEFAULT_SETTINGS,
} from '@/lib/optimization-settings-storage';
import {
  readGlobalDecisionAgentModel,
  writeGlobalDecisionAgentModel,
} from '@/lib/global-agent-models';
import { resolveModelForAgentCategory } from '@/lib/openrouter-agent-category-api';
import { normalizeOpenRouterChatModel } from '@/lib/openrouter-app-api';

function createMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('Decision Agent Settings & Category', () => {
  beforeEach(() => {
    const mem = createMemoryLocalStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage = mem;
    (globalThis as unknown as { window: unknown }).window = { localStorage: mem };
  });

  it('defaults decisionModel to liquid/d1.1 in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.decisionModel).toBe('liquid/d1.1');
  });

  it('reads global decision agent model default when storage is empty', () => {
    expect(readGlobalDecisionAgentModel()).toBe('liquid/d1.1');
    expect(getDecisionModel()).toBe('liquid/d1.1');
  });

  it('persists and retrieves updated global decision agent model', () => {
    writeGlobalDecisionAgentModel('liquid/lfm-2.5-24b-a2b');
    expect(readGlobalDecisionAgentModel()).toBe('liquid/lfm-2.5-24b-a2b');
    expect(getDecisionModel()).toBe('liquid/lfm-2.5-24b-a2b');
  });

  it('respects site-specific override in localStorage', () => {
    const siteId = 'test-site-99';
    localStorage.setItem(
      `optimization_settings_${siteId}`,
      JSON.stringify({ decisionModel: 'google/gemini-2.5-flash-lite' }),
    );
    expect(getDecisionModel(siteId)).toBe('google/gemini-2.5-flash-lite');
    // Global remains unaffected
    expect(getDecisionModel()).toBe('liquid/d1.1');
  });

  it('resolves model for decision agent category', () => {
    expect(resolveModelForAgentCategory('decision')).toBe('liquid/d1.1');
    writeGlobalDecisionAgentModel('deepseek/deepseek-v4.1-flash');
    expect(resolveModelForAgentCategory('decision')).toBe('deepseek/deepseek-v4.1-flash');
  });

  it('normalizes liquid/d1.1 and liquid/lfm-2.5-2.6b to policy-compliant liquid/lfm-2.5-24b-a2b', () => {
    expect(normalizeOpenRouterChatModel('liquid/d1.1')).toBe('liquid/lfm-2.5-24b-a2b');
    expect(normalizeOpenRouterChatModel('liquid/lfm-2.5-2.6b')).toBe('liquid/lfm-2.5-24b-a2b');
    expect(normalizeOpenRouterChatModel('liquid/lfm-2.5-2.6b:free')).toBe('liquid/lfm-2.5-24b-a2b');
    expect(normalizeOpenRouterChatModel('google/gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
  });
});
