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
export type QueryParams = Record<string, string | number | boolean | null | undefined>;
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
export declare class HttpError extends Error {
    /** HTTP 状态码 */
    readonly status: number;
    /** 状态文本 */
    readonly statusText: string;
    /** 请求方法 */
    readonly method: string;
    /** 请求 URL */
    readonly url: string;
    /** 已读取的响应体文本 (尽力而为) */
    readonly bodyText: string;
    constructor(
    /** HTTP 状态码 */
    status: number, 
    /** 状态文本 */
    statusText: string, 
    /** 请求方法 */
    method: string, 
    /** 请求 URL */
    url: string, 
    /** 已读取的响应体文本 (尽力而为) */
    bodyText: string);
}
export declare class HttpManager {
    private readonly baseUrl?;
    private readonly defaultHeaders;
    private readonly timeoutMs;
    private readonly retries;
    private readonly retryBackoffMs;
    private readonly logger?;
    /** 跟踪所有在途请求的 controller, 用于 dispose 时统一中断 */
    private readonly inflight;
    private disposed;
    constructor(options?: HttpManagerOptions);
    /** 发起请求并解析 JSON 响应 */
    getJson<T>(path: string, options?: HttpRequestOptions): Promise<T>;
    /** POST JSON 并解析 JSON 响应 */
    postJson<T>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
    /** 发起请求并读取纯文本 */
    getText(path: string, options?: HttpRequestOptions): Promise<string>;
    /** GET 原始 Response */
    get(path: string, options?: HttpRequestOptions): Promise<Response>;
    /** POST 原始 Response */
    post(path: string, body?: unknown, options?: HttpRequestOptions): Promise<Response>;
    /** PUT 原始 Response */
    put(path: string, body?: unknown, options?: HttpRequestOptions): Promise<Response>;
    /** PATCH 原始 Response */
    patch(path: string, body?: unknown, options?: HttpRequestOptions): Promise<Response>;
    /** DELETE 原始 Response */
    delete(path: string, options?: HttpRequestOptions): Promise<Response>;
    /**
     * 核心请求方法。返回 2xx 的 {@link Response}; 非 2xx 抛出 {@link HttpError}。
     * 网络错误与可重试状态码会按指数退避自动重试。
     */
    request(method: HttpMethod, path: string, options?: HttpRequestOptions): Promise<Response>;
    /** 中断所有在途请求并标记为已卸载 */
    dispose(): void;
    /** 执行单次 fetch, 处理超时与在途跟踪 */
    private fetchOnce;
    /** 基于 baseUrl 解析路径并附加查询参数 */
    private buildUrl;
    /** 合并请求头并序列化请求体 */
    private buildBody;
}
