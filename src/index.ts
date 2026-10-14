import {
  Adapter,
  AdapterContext,
  AdapterProcessRequestParams,
  AdapterProcessResponsePayload,
  AdapterRepostRequestParams,
  AdapterRepostResponsePayload,
  ProcessMediaInfo,
  RepostMethod,
  SocialProvider,
} from '@snowball-bot/repost-adapter';
import { HttpManager } from './utils/http';
import { extractHandleId, fetchHandleDataFromAPI } from './manager';
import { RednoteManager } from './rednote/rednote.manager';
import { XhsCli } from './rednote/xhs-cli';
import { NoteData, Stream, StreamItem } from './rednote/rednote.type';
import {
  FetchHandleDataFailedException,
  UnsupportedMethodException,
  UnsupportedProcessException,
} from './utils/error';
import dayjs from 'dayjs';
import { RepostExtraParams } from './type';

export { HttpManager, HttpError } from './utils/http';
export type {
  HttpManagerOptions,
  HttpRequestOptions,
  HttpMethod,
  QueryParams,
} from './utils/http';

// ============================================================================
// TODO: 1. 修改下方 manifest 信息
// ============================================================================
//
// - manifest.name: 必须以 `repost-adapter-` 开头
// - manifest.provider: 你的平台标识符，比如 'twitter' / 'bilibili'
// - manifest.whitelistHosts: 你的 adapter 接管的域名列表（不带 www）
// - manifest.version: 适配器自己的版本号，每次有重大变化时递增
// - manifest.author: 你的昵称
// - manifest.billing: 各类费用雪花定价
// - manifest.providerInfo: 该适配器的基本信息
//
// ============================================================================

/**
 * 常量仓库
 * @param apiBaseURL API 基础地址
 * @param provider 提供商
 * @param apiTimeout API 超时时间（毫秒）
 * @param apiRetries API 重试次数
 * @param cliTimeout xhs CLI 单次调用超时时间（毫秒）
 */
const CONST: {
  apiBaseURL: string;
  provider: SocialProvider;
  apiTimeout: number;
  apiRetries: number;
  cliTimeout: number;
} = {
  provider: 'rednote',
  apiBaseURL: 'https://www.xiaohongshu.com',
  apiTimeout: 5000,
  apiRetries: 1,
  cliTimeout: 30000,
};

/**
 * 实例仓库
 * @param instance.http 模块级 HTTP 客户端, 在 initState 中创建, dispose 中销毁
 * @param instance.rednote 小红书工具类, 在 initState 中创建, 复用 http 客户端
 * */
const INSTANCE: {
  http: HttpManager | null;
  rednote: RednoteManager | null;
} = {
  http: null,
  rednote: null,
};

const adapter: Adapter = {
  manifest: {
    name: `repost-adapter-${CONST.provider}`,
    provider: CONST.provider,
    whitelistHosts: ['xiaohongshu.com', 'xhslink.cn'],
    version: 1,
    author: 'Rominwolf',
    billing: {
      text: 100,
      token: 100,
      media: 1000,
      green: 1,
    },
    providerInfo: {
      name: '小红书',
      icon: '📕',
      color: '#FFFFFF',
      bgColor: '#F72340',
    },
  },

  /**
   * 适配器初始化时触发，在此处注册各类资源
   * @param ctx
   *
   * 可选配置:
   *   - rednoteCookie: 短链跳转时携带的 Cookie
   *   - xhsBinary: xhs CLI 可执行文件路径 (DEF: 从 PATH 查找 `xhs`)
   */
  async initState(ctx: AdapterContext) {
    const rednoteCookie = ctx.config<string>('rednoteCookie') ?? '';

    // 创建 HTTP 客户端 (基于 fetch), 仅用于短链 -> 长链跳转
    INSTANCE.http = new HttpManager({
      baseUrl: CONST.apiBaseURL,
      timeoutMs: CONST.apiTimeout,
      retries: CONST.apiRetries,
      headers: rednoteCookie ? { Cookie: rednoteCookie } : undefined,
      logger: ctx.logger,
    });

    // 创建小红书工具类: 短链走 HTTP, 笔记解析走 xhs CLI
    INSTANCE.rednote = new RednoteManager({
      http: INSTANCE.http,
      cli: new XhsCli({
        binary: ctx.config<string>('xhsBinary'),
        timeoutMs: CONST.cliTimeout,
        logger: ctx.logger,
      }),
      logger: ctx.logger,
    });

    // 注册转发请求处理器
    ctx.on('onRepostRequest', (req) => handleRepostRequest(req, ctx, {}));
    ctx.on('onProcessRequest', (req) => handleProcessingRequest(req, ctx, {}));

    ctx.logger.info(`[${CONST.provider}] Adapter initialized.`);
  },

  /**
   * 适配器销毁时触发，在此处清理各类资源
   *
   * eg. 关闭 HTTP 客户端, 清空定时器, 断开长连接...
   */
  async dispose() {
    // 中断在途请求并释放 HTTP 客户端
    INSTANCE.http?.dispose();
    INSTANCE.http = null;
    INSTANCE.rednote = null;
  },
};

// ============================================================================
// TODO: 2. 实现下方的 handle 函数
// ============================================================================
//
// 这是 adapter 的核心：接收一个 URL，返回标准化的转发数据。
//
// ============================================================================

async function handleRepostRequest(
  req: AdapterRepostRequestParams,
  ctx: AdapterContext,
  _options: object
): Promise<AdapterRepostResponsePayload | null> {
  const { helper, logger } = ctx;

  logger.debug(`[${CONST.provider}] fetching ${req.source}`);

  // 从 req.source 解析出 Handle Info
  let [handleMethod, handleId] = extractHandleId(req.source);

  // 不支持的转发模式
  if (!handleMethod || !handleId || handleMethod === 'live')
    throw new UnsupportedMethodException(
      handleMethod as RepostMethod,
      handleId
    );

  // 对于短链，先解析成带 xsec_token 的长链
  if (handleMethod === 'short') {
    req.source = await INSTANCE.rednote!.resolveShortLink(req.source);
    handleMethod = 'post';
  }

  logger.debug(`[${CONST.provider}] final fetching... ${req.source}`);

  // 调用小红书工具类拿到笔记数据 (传入完整长链, 含 xsec_token 等查询参数)
  const handleData = await fetchHandleDataFromAPI(
    INSTANCE.rednote!,
    handleMethod,
    req.source
  );

  logger.debug('HANDLE DATA', JSON.stringify(handleData));

  // 优先用负载里的真实 noteId 作 postId, 保证长/短链得到一致结果;
  // 负载缺失时回退到 extractHandleId 的临时 id
  const postId = handleData?.noteId || handleId;

  // 函数：构建 Post
  const fnBuildPost = (): Omit<
    AdapterRepostResponsePayload<RepostExtraParams>,
    'postId' | 'method' | 'code' | 'originalUrl' | 'provider' | 'requester'
  > => {
    const note = handleData;
    if (!note) {
      throw new FetchHandleDataFailedException(
        'post',
        handleId,
        '笔记负载缺失或解析失败'
      );
    }

    const { title, desc, user, interactInfo, imageList, time } = note;

    // 图片组: 取每张图的默认 URL (视频笔记的 imageList 通常为封面帧)
    const images = (imageList ?? [])
      .map((img) => img.urlDefault || img.url)
      .filter(Boolean);

    // 互动数为字符串 (eg. "415" / "4.5万"), 转成数字交给 extraHumanable 做人类可读格式化
    const toNum = parseCount;

    return {
      // NoteData.time 为 unix 毫秒时间戳
      publishAt: time ? dayjs(time).toDate() : undefined,

      author: {
        nickname: user?.nickname ?? 'momo',
        headshotUrl: user?.avatar,
      },

      title: title,
      content: desc ?? '',

      // 单图作封面, 多图作图片组
      cover: images.length === 1 ? images[0] : undefined,
      images: images.length > 1 ? images : undefined,

      badges: [
        [
          {
            emoji: '♥',
            name: helper.extraHumanable(
              '点赞',
              toNum(interactInfo?.likedCount),
              '人'
            ),
          },
          {
            emoji: '⭐',
            name: helper.extraHumanable(
              '收藏',
              toNum(interactInfo?.collectedCount),
              '次'
            ),
          },
          {
            emoji: '💬',
            name: helper.extraHumanable(
              '评论',
              toNum(interactInfo?.commentCount),
              '条'
            ),
          },
          {
            emoji: '📤',
            name: helper.extraHumanable(
              '分享',
              toNum(interactInfo?.shareCount),
              '次'
            ),
          },
        ],
      ],

      strawberry: {
        emoji: '🖼',
        feature: '原图',
      },

      extra: {
        rawUrl: req.source,
      },
    };
  };

  // 函数：构建 Profile
  const fnBuildProfile = (): Omit<
    AdapterRepostResponsePayload,
    'postId' | 'method' | 'code' | 'originalUrl' | 'provider' | 'requester'
  > => {
    const payload = handleData as unknown;

    return {
      author: {
        nickname: '',
      },

      content: '',

      badges: [[{ emoji: '👀', name: helper.extraHumanable('浏览', 0, '次') }]],
    };
  };

  // 转换成标准 response 格式
  return {
    method: handleMethod,
    provider: CONST.provider,
    code: req.code,
    originalUrl: req.source,
    requester: req.requester,

    postId,

    ...(handleMethod === 'post' ? fnBuildPost() : fnBuildProfile()),
  };
}

/**
 * 解析互动数字符串: "415" -> 415, "4.5万" -> 45000, "1.2亿" -> 120000000
 */
export function parseCount(value?: string): number {
  const match = (value ?? '').trim().match(/^([\d.]+)\s*(万|w|亿)?/i);
  if (!match) return 0;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === '亿' ? 1e8 : unit ? 1e4 : 1;
  return Math.round(num * multiplier);
}

/**
 * 从 NoteData 收集全部媒体资源 (图片 / 视频 / 实况视频), 转成进程媒体列表。
 *
 *   - 视频笔记: 取主视频 (流优先级 h265 体积更小 > h264 > av1 > h266)
 *   - 图片笔记: 取每张原图; 实况图额外附带其视频流
 */
function extractNoteMedias(note: NoteData): ProcessMediaInfo[] {
  const medias: ProcessMediaInfo[] = [];

  // 按编码优先级从视频流里取首个可用的 masterUrl。
  // 流的键名随通道不同:
  //   - HTML state: h265 / h264 / av1 / h266
  //   - feed API (xhs CLI): EF5 (= h265) / EF4 (= h264) / EF6 / EF7 (未确认)
  // 已知键都取不到时, 兜底取任意非空流, 避免平台新增编码标签后视频直接丢失。
  // 同一编码下可能有多个清晰度 (eg. 720p / 1080p / 1440p), 取分辨率最高者
  const pickStreamUrl = (stream?: Stream): string | undefined => {
    if (!stream) return undefined;
    const known = ['h265', 'EF5', 'h264', 'EF4', 'av1', 'h266'];
    const keys = [
      ...known,
      ...Object.keys(stream).filter((k) => !known.includes(k)),
    ];
    for (const key of keys) {
      const variants = (stream[key] ?? []).filter((v) => v.masterUrl);
      if (!variants.length) continue;
      const pixels = (v: StreamItem) => (v.width ?? 0) * (v.height ?? 0);
      return variants.reduce((best, v) => (pixels(v) > pixels(best) ? v : best))
        .masterUrl;
    }
    return undefined;
  };

  // 视频笔记: 仅返回主视频 (imageList 此时为封面帧, 不重复输出)
  if (note.video) {
    const url = pickStreamUrl(note.video.media?.stream);
    if (url) medias.push({ type: 'video', url });
    return medias;
  }

  // 图片笔记: 逐张输出原图; 实况图额外附带视频流
  for (const image of note.imageList ?? []) {
    if (image.livePhoto) {
      const liveUrl = pickStreamUrl(image.stream);
      if (liveUrl) medias.push({ type: 'video', url: liveUrl });
    }

    const imageUrl = image.urlDefault || image.url;
    if (imageUrl) medias.push({ type: 'image', url: imageUrl });
  }

  return medias;
}

async function handleProcessingRequest(
  req: AdapterProcessRequestParams,
  ctx: AdapterContext,
  _options: object
): Promise<AdapterProcessResponsePayload | null> {
  const { logger } = ctx;
  const { method, source, requester, code, repostMethod, extra: _extra } = req;
  const { rawUrl } = _extra as RepostExtraParams;

  logger.debug(`[${CONST.provider}] fetching ${method}: ${source}`);

  // 获取原图 / 原视频: 抓取笔记并返回其全部媒体资源
  if (method === 'strawberry' && repostMethod === 'post') {
    const note = await fetchHandleDataFromAPI(
      INSTANCE.rednote!,
      'post',
      rawUrl
    );
    if (!note) {
      throw new FetchHandleDataFailedException(
        'post',
        source,
        '笔记负载缺失或解析失败'
      );
    }

    logger.debug('PROCESS NOTE DATA', JSON.stringify(note));

    return {
      method,
      requester,
      code,
      provider: CONST.provider,
      medias: extractNoteMedias(note),
    };
  }

  // 抛出不支持的进程
  throw new UnsupportedProcessException(method, source);
}

export default adapter;
