import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
  AdapterContext,
  ProcessHandler,
  RepostHandler,
} from '@snowball-bot/repost-adapter';
import adapter, { parseCount } from '../src';
import { extractHandleId } from '../src/manager';

// 拦截 xhs CLI 调用
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

/** 让 CLI 调用以给定 JSON 作为 stdout 返回 */
function mockCli(response: unknown, exitCode = 0) {
  execFileMock.mockImplementation((_file, _args, _opts, callback) => {
    const error = exitCode
      ? Object.assign(new Error('Command failed'), { code: exitCode })
      : null;
    callback(error, JSON.stringify(response), '');
  });
}

/** 构造 feed API 形态的 `xhs read --json` 成功响应 */
function feedResponse(noteCard: Record<string, unknown>) {
  return {
    ok: true,
    schema_version: '1',
    data: {
      cursor_score: '',
      current_time: 0,
      items: [
        {
          id: noteCard.note_id,
          model_type: 'note',
          ignore: false,
          note_card: noteCard,
        },
      ],
    },
  };
}

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

const requester = { userId: 'U', nickname: 'N' };

describe('adapter', () => {
  it('exposes correct manifest', () => {
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
    mockCli(
      feedResponse({
        note_id: 'NOTE_FROM_PAYLOAD',
        title: '标题',
        desc: '正文内容',
        time: 1700000000000,
        user: {
          user_id: 'AUTHOR_ID',
          nickname: '作者昵称',
          avatar: 'https://x/a.jpg',
        },
        interact_info: {
          liked_count: '4.5万',
          collected_count: '30',
          comment_count: '8',
          share_count: '2',
        },
        image_list: [
          { url_default: 'https://x/1.jpg', url: '' },
          { url_default: 'https://x/2.jpg', url: '' },
        ],
      })
    );

    const { ctx, getHandler } = createMockContext();
    await adapter.initState(ctx);

    const source =
      'https://www.xiaohongshu.com/discovery/item/IDFROMURL?xsec_token=abc';
    const result = await getHandler()({ source, code: 'test', requester });

    // CLI 以 `xhs read <URL> --json` 调用
    expect(execFileMock.mock.calls[0][0]).toBe('xhs');
    expect(execFileMock.mock.calls[0][1]).toEqual(['read', source, '--json']);

    expect(result).not.toBeNull();
    expect(result!.originalUrl).toBe(source);
    // postId 应取自负载的 note_id, 而非 URL 路径里的临时 id
    expect(result!.postId).toBe('NOTE_FROM_PAYLOAD');
    expect(result!.author.nickname).toBe('作者昵称');
    expect(result!.title).toBe('标题');
    expect(result!.content).toBe('正文内容');
    expect(result!.images).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
    expect(result!.badges![0][0].name).toBe('点赞 45000 人');
  });

  it('resolves short links to the long link before calling the CLI', async () => {
    const longUrl =
      'https://www.xiaohongshu.com/discovery/item/NID?xsec_token=TOKEN&xsec_source=app_share';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const res = new Response('', { status: 200 });
        Object.defineProperty(res, 'url', { value: longUrl });
        return res;
      })
    );
    mockCli(feedResponse({ note_id: 'NID', image_list: [] }));

    const { ctx, getHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getHandler()({
      source: 'https://xhslink.cn/o/Au0UbrL4ZPP',
      code: 'test',
      requester,
    });

    expect(execFileMock.mock.calls[0][1]).toEqual(['read', longUrl, '--json']);
    expect(result!.method).toBe('post');
    expect(result!.postId).toBe('NID');
  });

  it('accepts the HTML-fallback (camelCase) payload shape', async () => {
    mockCli({
      ok: true,
      schema_version: '1',
      data: {
        noteId: 'HTML_NID',
        title: 'T',
        desc: 'D',
        imageList: [{ urlDefault: 'https://x/1.jpg' }],
      },
    });

    const { ctx, getHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getHandler()({
      source: 'https://www.xiaohongshu.com/explore/HTML_NID?xsec_token=abc',
      code: 'test',
      requester,
    });

    expect(result!.postId).toBe('HTML_NID');
    expect(result!.cover).toBe('https://x/1.jpg');
  });

  it('throws XhsCliException on a CLI error response', async () => {
    mockCli(
      {
        ok: false,
        schema_version: '1',
        error: { code: 'api_error', message: 'Note not found' },
      },
      1
    );

    const { ctx, getHandler } = createMockContext();
    await adapter.initState(ctx);

    await expect(
      getHandler()({
        source: 'https://www.xiaohongshu.com/explore/BAD?xsec_token=abc',
        code: 'test',
        requester,
      })
    ).rejects.toMatchObject({
      name: 'XhsCliException',
      code: 'api_error',
      msg: 'Note not found',
    });
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
    expect(extractHandleId('https://xhslink.cn/o/Au0UbrL4ZPP')).toEqual([
      'short',
      'Au0UbrL4ZPP',
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
  const rawUrl = 'https://www.xiaohongshu.com/discovery/item/NID?xsec_token=abc';
  const baseReq = {
    method: 'strawberry' as const,
    repostMethod: 'post' as const,
    source: 'NID',
    code: 'c1',
    requester,
    extra: { rawUrl },
  };

  it('returns every image of an image note', async () => {
    mockCli(
      feedResponse({
        note_id: 'NID',
        image_list: [
          { url_default: 'https://x/1.jpg', live_photo: false },
          { url_default: 'https://x/2.jpg', live_photo: false },
        ],
      })
    );
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(execFileMock.mock.calls[0][1]).toEqual(['read', rawUrl, '--json']);
    expect(result).not.toBeNull();
    expect(result!.medias).toEqual([
      { type: 'image', url: 'https://x/1.jpg' },
      { type: 'image', url: 'https://x/2.jpg' },
    ]);
  });

  it('returns the live-photo video alongside its still image', async () => {
    mockCli(
      feedResponse({
        note_id: 'NID',
        image_list: [
          {
            url_default: 'https://x/live.jpg',
            live_photo: true,
            stream: { h264: [{ master_url: 'https://x/live.mp4' }] },
          },
        ],
      })
    );
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(result!.medias).toEqual([
      { type: 'video', url: 'https://x/live.mp4' },
      { type: 'image', url: 'https://x/live.jpg' },
    ]);
  });

  it('returns only the main video (h265 preferred) for a video note', async () => {
    mockCli(
      feedResponse({
        note_id: 'NID',
        type: 'video',
        image_list: [{ url_default: 'https://x/poster.jpg', live_photo: false }],
        video: {
          media: {
            stream: {
              h265: [{ master_url: 'https://x/v265.mp4' }],
              h264: [{ master_url: 'https://x/v264.mp4' }],
            },
          },
        },
      })
    );
    const { ctx, getProcessHandler } = createMockContext();
    await adapter.initState(ctx);

    const result = await getProcessHandler()(baseReq);

    expect(result!.medias).toEqual([
      { type: 'video', url: 'https://x/v265.mp4' },
    ]);
  });
});

describe('parseCount', () => {
  it('parses plain and 万/亿 suffixed counts', () => {
    expect(parseCount('415')).toBe(415);
    expect(parseCount('4.5万')).toBe(45000);
    expect(parseCount('1.2亿')).toBe(120000000);
    expect(parseCount('')).toBe(0);
    expect(parseCount(undefined)).toBe(0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  execFileMock.mockReset();
});
