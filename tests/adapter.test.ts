import { describe, it, expect, vi } from 'vitest';
import type {
  AdapterContext,
  RepostHandler,
} from '@snowball-bot/repost-adapter';
import adapter from '../src';

function createMockContext(
  configValues: Record<string, unknown> = {}
): { ctx: AdapterContext; getHandler: () => RepostHandler } {
  let handler: RepostHandler | null = null;

  const ctx: AdapterContext = {
    on: vi.fn((event, h) => {
      if (event === 'onRepostRequest') handler = h;
    }),
    config: vi.fn((key: string) => configValues[key]) as AdapterContext['config'],
    helper: {
      pick: (record, key, fallback) => record[key] ?? fallback!,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };

  return {
    ctx,
    getHandler: () => {
      if (!handler) throw new Error('Handler not registered');
      return handler;
    },
  };
}

describe('adapter', () => {
  it('exposes correct manifest', () => {
    // TODO: 改成你自己的预期值
    expect(adapter.manifest.name).toMatch(/^repost-adapter-/);
    expect(adapter.manifest.whitelistHosts.length).toBeGreaterThan(0);
  });

  it('registers handler on init', async () => {
    const { ctx } = createMockContext();
    await adapter.initState(ctx);
    expect(ctx.on).toHaveBeenCalledWith(
      'onRepostRequest',
      expect.any(Function)
    );
  });

  it('handles a request', async () => {
    const { ctx, getHandler } = createMockContext({
      apiKey: 'test-key',
    });
    await adapter.initState(ctx);

    const result = await getHandler()({
      source: 'https://example.com/posts/123',
      code: 'test',
      requester: {
        userId: 'REQUESTER_USERID',
        nickname: 'REQUESTER_NICKNAME',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.originalUrl).toBe('https://example.com/posts/123');
  });
});
