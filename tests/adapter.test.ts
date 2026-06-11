import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
  AdapterContext,
  RepostHandler,
} from '@snowball-bot/repost-adapter';
import adapter from '../src';
import { extractHandleId } from '../src/manager';

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
      extraHumanable: (label: string, value: number, unit: string) =>
        `${label} ${value} ${unit}`,
    } as AdapterContext['helper'],
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

  it('handles a request, deriving postId from payload', async () => {
    // 模拟页面 HTML, 内含可被 __INITIAL_STATE__ 解析器识别的负载
    const html =
      '<html><script>window.__INITIAL_STATE__ = ' +
      '{"note":{"currentNoteId":"NOTE_FROM_PAYLOAD","noteDetailMap":{}}}' +
      '</script></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 }))
    );

    const { ctx, getHandler } = createMockContext({ apiKey: 'test-key' });
    await adapter.initState(ctx);

    const source =
      'https://www.xiaohongshu.com/discovery/item/IDFROMURL?app_platform=android';
    const result = await getHandler()({
      source,
      code: 'test',
      requester: {
        userId: 'REQUESTER_USERID',
        nickname: 'REQUESTER_NICKNAME',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.originalUrl).toBe(source);
    // postId 应取自负载的 currentNoteId, 而非 URL 路径里的临时 id
    expect(result!.postId).toBe('NOTE_FROM_PAYLOAD');
  });
});

describe('extractHandleId', () => {
  it('parses long discovery/item links', () => {
    expect(
      extractHandleId(
        'https://www.xiaohongshu.com/discovery/item/6a291d28?app_platform=android'
      )
    ).toEqual(['post', '6a291d28']);
  });

  it('parses long explore links', () => {
    expect(
      extractHandleId('https://www.xiaohongshu.com/explore/6a291d28?xsec_token=abc')
    ).toEqual(['post', '6a291d28']);
  });

  it('parses short xhslink links to a provisional id', () => {
    expect(extractHandleId('http://xhslink.com/o/d8PISjsVoB')).toEqual([
      'post',
      'd8PISjsVoB',
    ]);
  });

  it('parses user profile links', () => {
    expect(
      extractHandleId('https://www.xiaohongshu.com/user/profile/5ff0e2a1')
    ).toEqual(['profile', '5ff0e2a1']);
  });

  it('returns empty tuple for unsupported or invalid URLs', () => {
    expect(extractHandleId('https://www.xiaohongshu.com/')).toEqual([]);
    expect(extractHandleId('https://example.com/posts/123')).toEqual([]);
    expect(extractHandleId('not a url')).toEqual([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
