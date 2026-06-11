import {
  Adapter,
  AdapterContext,
  AdapterProcessRequestParams, AdapterProcessResponsePayload,
  AdapterRepostRequestParams,
  AdapterRepostResponsePayload,
  SocialProvider,
} from '@snowball-bot/repost-adapter';
import { HttpManager } from './utils/http';
import {extractHandleId, fetchHandleDataFromAPI} from "./manager";
import {UnsupportedMethodException, UnsupportedProcessException} from "./utils/error";
import dayjs from "dayjs";

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
  apiBaseURL: string,
  provider: SocialProvider,
  apiTimeout: number,
  apiRetries: number,
} = {
  provider: "REPLACE_ME",
  apiBaseURL: "https://example.com",
  apiTimeout: 5000,
  apiRetries: 1,
}

/**
 * 实例仓库
 * @param instance.http 模块级 HTTP 客户端, 在 initState 中创建, dispose 中销毁
 * */
const INSTANCE: {
  http: HttpManager | null;
} = {
  http: null,
}

const adapter: Adapter = {
  manifest: {
    name: `repost-adapter-${CONST.provider}`,
    provider: CONST.provider,
    whitelistHosts: ['example.com'],
    version: 1,
    author: 'REPLACE_ME',
    billing: {
      text: 100,
      token: 100,
      media: 1000,
      green: 1,
    },
    providerInfo: {
      name: 'REPLACE_ME',
      icon: '✨',
      color: '#FFFFFF',
      bgColor: '#000000',
    }
  },

  /**
   * 适配器初始化时触发，在此处注册各类资源
   * @param ctx
   */
  async initState(ctx: AdapterContext) {
    // 读取配置（可选）。配置由核心通过 `ctx.config(key)` 提供。
    // 比如 API key、限流参数等，建议把所有可调项都从 config 取。
    const apiKey = ctx.config<string>('apiKey');
    if (!apiKey) {
      ctx.logger.warn(
        `[${CONST.provider}] no apiKey configured, falling back to public API`
      );
    }

    // 创建 HTTP 客户端 (基于 fetch), 统一处理 baseUrl / 鉴权 / 超时 / 重试
    INSTANCE.http = new HttpManager({
      baseUrl: CONST.apiBaseURL,
      timeoutMs: CONST.apiTimeout,
      retries: CONST.apiRetries,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
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
  _options: object,
): Promise<AdapterRepostResponsePayload | null> {
  const { helper, logger } = ctx;

  logger.debug(`[${CONST.provider}] fetching ${req.source}`);

  // 从 req.source 解析出 Handle Info
  const [handleMethod, handleId] = extractHandleId(req.source);

  // 不支持的转发模式
  if (!handleMethod || !handleId || handleMethod === "live")
    throw new UnsupportedMethodException(handleMethod, handleId);

  // 调用平台 API 拿到原始数据
  const handleData = await fetchHandleDataFromAPI(INSTANCE.http!, handleMethod, handleId);

  // 函数：构建 Post
  const fnBuildPost = (): Omit<
    AdapterRepostResponsePayload,
    'postId' | 'method' | "code" | "originalUrl" | "provider" | "requester"
  > => {
    const payload = handleData as unknown;

    return {
      publishAt: dayjs.unix(10000000000).toDate(),

      author: {
        nickname: "",
      },

      content: "",

      badges: [
        [
          { emoji: "👀", name: helper.extraHumanable("浏览", 0, "次") },
        ]
      ],

      strawberry: {
        emoji: "🖼",
        feature: "原图",
      },
    };
  };

  // 函数：构建 Profile
  const fnBuildProfile = (): Omit<
    AdapterRepostResponsePayload,
    'postId' | 'method' | "code" | "originalUrl" | "provider" | "requester"
  > => {
    const payload = handleData as unknown;

    return {
      author: {
        nickname: "",
      },

      content: "",

      badges: [
        [
          { emoji: "👀", name: helper.extraHumanable("浏览", 0, "次") },
        ]
      ],
    }
  }

  // 转换成标准 response 格式
  return {
    method: handleMethod,
    provider: CONST.provider,
    code: req.code,
    originalUrl: req.source,
    requester: req.requester,

    postId: handleId,

    ...(handleMethod === "post" ? fnBuildPost() : fnBuildProfile()),
  };
}

async function handleProcessingRequest(
  req: AdapterProcessRequestParams,
  ctx: AdapterContext,
  _options: object
): Promise<AdapterProcessResponsePayload | null> {
  const { logger } = ctx;
  const { method, source, requester, code } = req;

  logger.debug(`[${CONST.provider}] fetching ${method}: ${source}`);

  // 获取原图
  if (method === 'strawberry') {

  }

  // 抛出不支持的进程
  throw new UnsupportedProcessException(method, source);
}

export default adapter;
