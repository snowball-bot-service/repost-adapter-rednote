import type { ILogger } from '@snowball-bot/repost-adapter';

/**
 * 基于全局 `fetch` 的轻量 HTTP Manager。
 *
 * 设计目标:
 *   - 统一 baseUrl / 默认 header / 超时 / 重试 等横切配置
 *   - 提供 json/text 便捷读取与查询参数构造
 *   - 失败时抛出结构化的 {@link HttpError}, 而非裸 Response
 *   - 支持 dispose: 适配器卸载时中断所有在途请求
 *
 * Node >= 18 已内置 `fetch` / `AbortController`, 无需额外依赖。
 */

/** 支持的 HTTP 方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** 查询参数: 值为 undefined / null 的项会被忽略 */
export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** 单次请求的可选项 */
export interface HttpRequestOptions {
  /** 查询参数, 会与 url 上已有的 query 合并 */
  query?: QueryParams;
  /** 请求头, 与默认头合并 (同名覆盖) */
  headers?: Record<string, string>;
  /**
   * 请求体。
   *   - 普通对象 / 数组: 自动 JSON 序列化并附带 application/json
   *   - 其余 (string / Buffer / URLSearchParams 等): 原样传递
   */
  body?: unknown;
  /** 本次请求超时 (ms), 覆盖全局配置 */
  timeoutMs?: number;
  /** 本次请求重试次数, 覆盖全局配置 */
  retries?: number;
  /** 外部传入的 AbortSignal, 会与内部超时信号联动 */
  signal?: AbortSignal;
}

/** HttpManager 构造配置 */
export interface HttpManagerOptions {
  /** 基础 URL, 相对路径会基于它解析 */
  baseUrl?: string;
  /** 默认请求头 */
  headers?: Record<string, string>;
  /** 默认超时 (ms), DEF: 10000 */
  timeoutMs?: number;
  /** 默认重试次数 (不含首次), DEF: 2 */
  retries?: number;
  /** 重试基础退避 (ms), 采用指数退避, DEF: 300 */
  retryBackoffMs?: number;
  /** 日志器 (通常传入 ctx.logger) */
  logger?: ILogger;
}

/**
 * HTTP 错误。当响应状态码非 2xx 时抛出。
 */
export class HttpError extends Error {
  constructor(
    /** HTTP 状态码 */
    readonly status: number,
    /** 状态文本 */
    readonly statusText: string,
    /** 请求方法 */
    readonly method: string,
    /** 请求 URL */
    readonly url: string,
    /** 已读取的响应体文本 (尽力而为) */
    readonly bodyText: string
  ) {
    super(`HTTP ${status} ${statusText} on ${method} ${url}`);
    this.name = 'HttpError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;

/** 可重试的状态码 (限流 / 网关 / 服务端临时不可用) */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class HttpManager {
  private readonly baseUrl?: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBackoffMs: number;
  private readonly logger?: ILogger;

  /** 跟踪所有在途请求的 controller, 用于 dispose 时统一中断 */
  private readonly inflight = new Set<AbortController>();
  private disposed = false;

  constructor(options: HttpManagerOptions = {}) {
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = { ...options.headers };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
    this.logger = options.logger;
  }

  /** 发起请求并解析 JSON 响应 */
  async getJson<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    const res = await this.request('GET', path, options);
    return (await res.json()) as T;
  }

  /** POST JSON 并解析 JSON 响应 */
  async postJson<T>(
    path: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<T> {
    const res = await this.request('POST', path, { ...options, body });
    return (await res.json()) as T;
  }

  /** 发起请求并读取纯文本 */
  async getText(path: string, options?: HttpRequestOptions): Promise<string> {
    const res = await this.request('GET', path, options);
    return res.text();
  }

  /** GET 原始 Response */
  get(path: string, options?: HttpRequestOptions): Promise<Response> {
    return this.request('GET', path, options);
  }

  /** POST 原始 Response */
  post(
    path: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<Response> {
    return this.request('POST', path, { ...options, body });
  }

  /** PUT 原始 Response */
  put(
    path: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<Response> {
    return this.request('PUT', path, { ...options, body });
  }

  /** PATCH 原始 Response */
  patch(
    path: string,
    body?: unknown,
    options?: HttpRequestOptions
  ): Promise<Response> {
    return this.request('PATCH', path, { ...options, body });
  }

  /** DELETE 原始 Response */
  delete(path: string, options?: HttpRequestOptions): Promise<Response> {
    return this.request('DELETE', path, options);
  }

  /**
   * 核心请求方法。返回 2xx 的 {@link Response}; 非 2xx 抛出 {@link HttpError}。
   * 网络错误与可重试状态码会按指数退避自动重试。
   */
  async request(
    method: HttpMethod,
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<Response> {
    if (this.disposed) {
      throw new Error('HttpManager has been disposed');
    }

    const url = this.buildUrl(path, options.query);
    const { headers, body } = this.buildBody(options);
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const maxRetries = options.retries ?? this.retries;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryBackoffMs * 2 ** (attempt - 1);
        this.logger?.debug(
          `[http] retry ${attempt}/${maxRetries} after ${delay}ms ${method} ${url}`
        );
        await sleep(delay);
      }

      try {
        const res = await this.fetchOnce(
          method,
          url,
          headers,
          body,
          timeoutMs,
          options.signal
        );

        if (res.ok) return res;

        // 非 2xx: 决定是否重试
        if (attempt < maxRetries && RETRYABLE_STATUS.has(res.status)) {
          lastError = new HttpError(
            res.status,
            res.statusText,
            method,
            url,
            ''
          );
          continue;
        }

        const bodyText = await safeReadText(res);
        throw new HttpError(
          res.status,
          res.statusText,
          method,
          url,
          bodyText
        );
      } catch (err) {
        // HttpError 表示已拿到响应但状态不可重试 -> 直接抛出
        if (err instanceof HttpError) throw err;

        lastError = err;

        // 外部主动取消, 不重试
        if (options.signal?.aborted) throw err;

        if (attempt < maxRetries) {
          this.logger?.warn(
            `[http] ${method} ${url} failed: ${errMessage(err)}`
          );
          continue;
        }
        throw err;
      }
    }

    // 理论上不可达, 兜底
    throw lastError ?? new Error(`Request failed: ${method} ${url}`);
  }

  /** 中断所有在途请求并标记为已卸载 */
  dispose(): void {
    this.disposed = true;
    for (const controller of this.inflight) {
      controller.abort();
    }
    this.inflight.clear();
  }

  /** 执行单次 fetch, 处理超时与在途跟踪 */
  private async fetchOnce(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    this.inflight.add(controller);

    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // 区分超时与其他网络错误
      if (controller.signal.aborted && !externalSignal?.aborted) {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      this.inflight.delete(controller);
    }
  }

  /** 基于 baseUrl 解析路径并附加查询参数 */
  private buildUrl(path: string, query?: QueryParams): string {
    const url = this.baseUrl ? new URL(path, this.baseUrl) : new URL(path);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  /** 合并请求头并序列化请求体 */
  private buildBody(options: HttpRequestOptions): {
    headers: Record<string, string>;
    body: BodyInit | undefined;
  } {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    const raw = options.body;
    if (raw === undefined || raw === null) {
      return { headers, body: undefined };
    }

    // 已是 fetch 可直接接受的类型, 原样传递
    if (
      typeof raw === 'string' ||
      raw instanceof URLSearchParams ||
      raw instanceof ArrayBuffer ||
      ArrayBuffer.isView(raw)
    ) {
      return { headers, body: raw as BodyInit };
    }

    // 普通对象 / 数组 -> JSON
    if (!hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    return { headers, body: JSON.stringify(raw) };
  }
}

/** 大小写不敏感地判断 header 是否存在 */
function hasHeader(
  headers: Record<string, string>,
  name: string
): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

/** 尽力读取响应体文本, 失败返回空串 */
async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}