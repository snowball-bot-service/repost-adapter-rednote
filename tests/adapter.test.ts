import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
  AdapterContext,
  ProcessHandler,
  RepostHandler,
} from '@snowball-bot/repost-adapter';
import adapter from '../src';
import { extractHandleId } from '../src/manager';

function createMockContext(
  configValues: Record<string, unknown> = {}
): {
  ctx: AdapterContext;
  getHandler: () => RepostHandler;
  getProcessHandler: () => ProcessHandler;
} {
  let handler: RepostHandler | null = null;
  let processHandler: ProcessHandler | null = null;

  const ctx: AdapterContext = {
    on: vi.fn((event, h) => {
      if (event === 'onRepostRequest') handler = h;
      if (event === 'onProcessRequest') processHandler = h;
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
    getProcessHandler: () => {
      if (!processHandler) throw new Error('Process handler not registered');
      return processHandler;
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
    // 模拟页面 __INITIAL_STATE__ 负载
    const state = {
      note: {
        currentNoteId: 'NOTE_FROM_PAYLOAD',
        noteDetailMap: {
          NOTE_FROM_PAYLOAD: {
            note: {
              noteId: 'NOTE_FROM_PAYLOAD',
              title: '标题',
              desc: '正文内容',
              time: 1700000000000,
              user: { userId: 'AUTHOR_ID', nickname: '作者昵称', avatar: 'https://x/a.jpg' },
              interactInfo: {
                likedCount: '120',
                collectedCount: '30',
                commentCount: '8',
                shareCount: '2',
              },
              imageList: [
                { urlDefault: 'https://x/1.jpg' },
                { urlDefault: 'https://x/2.jpg' },
              ],
            },
          },
        },
      },
    };
    const html = `<html><script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script></html>`;
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
    // fnBuildPost 应从负载映射出作者/正文/图片组
    expect(result!.author.nickname).toBe('作者昵称');
    expect(result!.title).toBe('标题');
    expect(result!.content).toBe('正文内容');
    expect(result!.images).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
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

describe('handleProcessingRequest (strawberry + post)', () => {
  function stubFetchWithNote(note: unknown) {
    const state = {
      note: {
        currentNoteId: 'NID',
        noteDetailMap: { NID: { note } },
      },
    };
    const html = `<html><script>window.__INITIAL_STATE__ = ${JSON.stringify(state)}</script></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200 }))
    );
  }

  const baseReq = {
    method: 'strawberry' as const,
    repostMethod: 'post' as const,
    source: 'https://www.xiaohongshu.com/discovery/item/NID',
    code: 'c1',
    requester: { userId: 'U', nickname: 'N' },
  };

  it('returns every image of an image note', async () => {
    stubFetchWithNote({
      imageList: [
        { urlDefault: 'https://x/1.jpg', livePhoto: false },
        { urlDefault: 'https://x/2.jpg', livePhoto: false },
      ],
    });
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(result).not.toBeNull();
    expect(result!.medias).toEqual([
      { type: 'image', url: 'https://x/1.jpg' },
      { type: 'image', url: 'https://x/2.jpg' },
    ]);
  });

  it('returns the live-photo video alongside its still image', async () => {
    stubFetchWithNote({
      imageList: [
        {
          urlDefault: 'https://x/live.jpg',
          livePhoto: true,
          stream: { h264: [{ masterUrl: 'https://x/live.mp4' }] },
        },
      ],
    });
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(result!.medias).toEqual([
      { type: 'video', url: 'https://x/live.mp4' },
      { type: 'image', url: 'https://x/live.jpg' },
    ]);
  });

  it('returns only the main video (h265 preferred) for a video note', async () => {
    stubFetchWithNote({
      imageList: [{ urlDefault: 'https://x/poster.jpg', livePhoto: false }],
      video: {
        media: {
          stream: {
            h265: [{ masterUrl: 'https://x/v265.mp4' }],
            h264: [{ masterUrl: 'https://x/v264.mp4' }],
          },
        },
      },
    });
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(result!.medias).toEqual([
      { type: 'video', url: 'https://x/v265.mp4' },
    ]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
