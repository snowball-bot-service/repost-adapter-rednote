import {
  Adapter,
  AdapterContext,
  AdapterProcessRequestParams,
  AdapterProcessResponsePayload,
  AdapterRepostRequestParams,
  AdapterRepostResponsePayload,
  ProcessMediaInfo,
  SocialProvider,
} from '@snowball-bot/repost-adapter';
import { HttpManager } from './utils/http';
import { extractHandleId, fetchHandleDataFromAPI } from './manager';
import { HOMEPAGE_URL, RednoteManager } from './rednote/rednote.manager';
import { NoteData } from './rednote/rednote.type';
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

interface AdapterOptions {
  apiKey?: string;
}

/**
 * 常量仓库
 * @param apiBaseURL API 基础地址
 * @param provider 提供商
 * @param apiTimeout API 超时时间（毫秒）
 * @param apiRetries API 重试次数
 */
const CONST: {
  apiBaseURL: string;
  provider: SocialProvider;
  apiTimeout: number;
  apiRetries: number;
} = {
  provider: 'rednote',
  apiBaseURL: 'https://www.xiaohongshu.com',
  apiTimeout: 5000,
  apiRetries: 1,
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
    whitelistHosts: ['xiaohongshu.com', 'xhslink.com'],
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
   */
  async initState(ctx: AdapterContext) {
    // 读取配置（可选）。配置由核心通过 `ctx.config(key)` 提供。
    // 比如 API key、限流参数等，建议把所有可调项都从 config 取。
    const apiKey = ctx.config<string>('apiKey');

    // 创建 HTTP 客户端 (基于 fetch), 统一处理 baseUrl / 鉴权 / 超时 / 重试
    INSTANCE.http = new HttpManager({
      baseUrl: CONST.apiBaseURL,
      timeoutMs: CONST.apiTimeout,
      retries: CONST.apiRetries,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      logger: ctx.logger,
    });

    // 创建小红书工具类, 复用上面的 HTTP 客户端 (其内部均使用绝对 URL, 不受 baseUrl 影响)
    INSTANCE.rednote = new RednoteManager({
      http: INSTANCE.http,
      logger: ctx.logger,
      helper: ctx.helper,
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
  const [handleMethod, handleId] = extractHandleId(req.source);

  // 不支持的转发模式
  if (!handleMethod || !handleId || handleMethod === 'live')
    throw new UnsupportedMethodException(handleMethod, handleId);

  // 调用小红书工具类拿到原始数据 (传入完整链接, 含 xsec_token 等查询参数)
  const handleData = await fetchHandleDataFromAPI(
    INSTANCE.rednote!,
    handleMethod,
    req.source
  );

  logger.debug('HANDLE DATA', handleData);

  // 优先用负载里的真实 noteId 作 postId, 保证长/短链得到一致结果;
  // 负载缺失时回退到 extractHandleId 的临时 id
  const postId = handleData?.note?.currentNoteId || handleId;

  // 函数：构建 Post
  const fnBuildPost = (): Omit<
    AdapterRepostResponsePayload<RepostExtraParams>,
    'postId' | 'method' | 'code' | 'originalUrl' | 'provider' | 'requester'
  > => {
    // 从负载里取出当前笔记的 NoteData
    const note =
      handleData?.note?.noteDetailMap?.[handleData.note.currentNoteId]?.note;
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

    // 互动数为字符串, 转成数字交给 extraHumanable 做人类可读格式化
    const toNum = (value?: string) => Number.parseInt(value ?? '0', 10) || 0;

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
 * 从 NoteData 收集全部媒体资源 (图片 / 视频 / 实况视频), 转成进程媒体列表。
 *
 *   - 视频笔记: 取主视频 (流优先级 h265 体积更小 > h264 > av1 > h266)
 *   - 图片笔记: 取每张原图; 实况图额外附带其视频流
 */
function extractNoteMedias(note: NoteData): ProcessMediaInfo[] {
  const medias: ProcessMediaInfo[] = [];

  // 按编码优先级从视频流里取首个可用的 masterUrl
  const pickStreamUrl = (stream?: {
    h265?: { masterUrl: string }[];
    h264?: { masterUrl: string }[];
    av1?: { masterUrl: string }[];
    h266?: { masterUrl: string }[];
  }): string | undefined => {
    for (const variants of [stream?.h265, stream?.h264, stream?.av1, stream?.h266]) {
      const url = variants?.[0]?.masterUrl;
      if (url) return url;
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
    const payload = await fetchHandleDataFromAPI(INSTANCE.rednote!, 'post', rawUrl);

    logger.debug("PROCESS RESPONSE DATA", JSON.stringify(payload));

    const note =
      payload?.note?.noteDetailMap?.[payload.note.currentNoteId]?.note;
    if (!note) {
      throw new FetchHandleDataFailedException(
        'post',
        source,
        '笔记负载缺失或解析失败'
      );
    }

    logger.debug("PROCESS NOTE DATA", JSON.stringify(note));

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
