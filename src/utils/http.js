/**
 * HTTP 错误。当响应状态码非 2xx 时抛出。
 */
export class HttpError extends Error {
    status;
    statusText;
    method;
    url;
    bodyText;
    constructor(
    /** HTTP 状态码 */
    status, 
    /** 状态文本 */
    statusText, 
    /** 请求方法 */
    method, 
    /** 请求 URL */
    url, 
    /** 已读取的响应体文本 (尽力而为) */
    bodyText) {
        super(`HTTP ${status} ${statusText} on ${method} ${url}`);
        this.status = status;
        this.statusText = statusText;
        this.method = method;
        this.url = url;
        this.bodyText = bodyText;
        this.name = 'HttpError';
    }
}
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;
/** 可重试的状态码 (限流 / 网关 / 服务端临时不可用) */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
export class HttpManager {
    baseUrl;
    defaultHeaders;
    timeoutMs;
    retries;
    retryBackoffMs;
    logger;
    /** 跟踪所有在途请求的 controller, 用于 dispose 时统一中断 */
    inflight = new Set();
    disposed = false;
    constructor(options = {}) {
        this.baseUrl = options.baseUrl;
        this.defaultHeaders = { ...options.headers };
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.retries = options.retries ?? DEFAULT_RETRIES;
        this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
        this.logger = options.logger;
    }
    /** 发起请求并解析 JSON 响应 */
    async getJson(path, options) {
        const res = await this.request('GET', path, options);
        return (await res.json());
    }
    /** POST JSON 并解析 JSON 响应 */
    async postJson(path, body, options) {
        const res = await this.request('POST', path, { ...options, body });
        return (await res.json());
    }
    /** 发起请求并读取纯文本 */
    async getText(path, options) {
        const res = await this.request('GET', path, options);
        return res.text();
    }
    /** GET 原始 Response */
    get(path, options) {
        return this.request('GET', path, options);
    }
    /** POST 原始 Response */
    post(path, body, options) {
        return this.request('POST', path, { ...options, body });
    }
    /** PUT 原始 Response */
    put(path, body, options) {
        return this.request('PUT', path, { ...options, body });
    }
    /** PATCH 原始 Response */
    patch(path, body, options) {
        return this.request('PATCH', path, { ...options, body });
    }
    /** DELETE 原始 Response */
    delete(path, options) {
        return this.request('DELETE', path, options);
    }
    /**
     * 核心请求方法。返回 2xx 的 {@link Response}; 非 2xx 抛出 {@link HttpError}。
     * 网络错误与可重试状态码会按指数退避自动重试。
     */
    async request(method, path, options = {}) {
        if (this.disposed) {
            throw new Error('HttpManager has been disposed');
        }
        const url = this.buildUrl(path, options.query);
        const { headers, body } = this.buildBody(options);
        const timeoutMs = options.timeoutMs ?? this.timeoutMs;
        const maxRetries = options.retries ?? this.retries;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = this.retryBackoffMs * 2 ** (attempt - 1);
                this.logger?.debug(`[http] retry ${attempt}/${maxRetries} after ${delay}ms ${method} ${url}`);
                await sleep(delay);
            }
            try {
                const res = await this.fetchOnce(method, url, headers, body, timeoutMs, options.signal);
                if (res.ok)
                    return res;
                // 非 2xx: 决定是否重试
                if (attempt < maxRetries && RETRYABLE_STATUS.has(res.status)) {
                    lastError = new HttpError(res.status, res.statusText, method, url, '');
                    continue;
                }
                const bodyText = await safeReadText(res);
                throw new HttpError(res.status, res.statusText, method, url, bodyText);
            }
            catch (err) {
                // HttpError 表示已拿到响应但状态不可重试 -> 直接抛出
                if (err instanceof HttpError)
                    throw err;
                lastError = err;
                // 外部主动取消, 不重试
                if (options.signal?.aborted)
                    throw err;
                if (attempt < maxRetries) {
                    this.logger?.warn(`[http] ${method} ${url} failed: ${errMessage(err)}`);
                    continue;
                }
                throw err;
            }
        }
        // 理论上不可达, 兜底
        throw lastError ?? new Error(`Request failed: ${method} ${url}`);
    }
    /** 中断所有在途请求并标记为已卸载 */
    dispose() {
        this.disposed = true;
        for (const controller of this.inflight) {
            controller.abort();
        }
        this.inflight.clear();
    }
    /** 执行单次 fetch, 处理超时与在途跟踪 */
    async fetchOnce(method, url, headers, body, timeoutMs, externalSignal) {
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
        }
        catch (err) {
            // 区分超时与其他网络错误
            if (controller.signal.aborted && !externalSignal?.aborted) {
                throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
            externalSignal?.removeEventListener('abort', onExternalAbort);
            this.inflight.delete(controller);
        }
    }
    /** 基于 baseUrl 解析路径并附加查询参数 */
    buildUrl(path, query) {
        const url = this.baseUrl ? new URL(path, this.baseUrl) : new URL(path);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value === undefined || value === null)
                    continue;
                url.searchParams.set(key, String(value));
            }
        }
        return url.toString();
    }
    /** 合并请求头并序列化请求体 */
    buildBody(options) {
        const headers = {
            ...this.defaultHeaders,
            ...options.headers,
        };
        const raw = options.body;
        if (raw === undefined || raw === null) {
            return { headers, body: undefined };
        }
        // 已是 fetch 可直接接受的类型, 原样传递
        if (typeof raw === 'string' ||
            raw instanceof URLSearchParams ||
            raw instanceof ArrayBuffer ||
            ArrayBuffer.isView(raw)) {
            return { headers, body: raw };
        }
        // 普通对象 / 数组 -> JSON
        if (!hasHeader(headers, 'content-type')) {
            headers['Content-Type'] = 'application/json';
        }
        return { headers, body: JSON.stringify(raw) };
    }
}
/** 大小写不敏感地判断 header 是否存在 */
function hasHeader(headers, name) {
    const lower = name.toLowerCase();
    return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}
/** 尽力读取响应体文本, 失败返回空串 */
async function safeReadText(res) {
    try {
        return await res.text();
    }
    catch {
        return '';
    }
}
function errMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHR0cC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImh0dHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBMkRBOztHQUVHO0FBQ0gsTUFBTSxPQUFPLFNBQVUsU0FBUSxLQUFLO0lBR3ZCO0lBRUE7SUFFQTtJQUVBO0lBRUE7SUFWWDtJQUNFLGVBQWU7SUFDTixNQUFjO0lBQ3ZCLFdBQVc7SUFDRixVQUFrQjtJQUMzQixXQUFXO0lBQ0YsTUFBYztJQUN2QixhQUFhO0lBQ0osR0FBVztJQUNwQix1QkFBdUI7SUFDZCxRQUFnQjtRQUV6QixLQUFLLENBQUMsUUFBUSxNQUFNLElBQUksVUFBVSxPQUFPLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBVmpELFdBQU0sR0FBTixNQUFNLENBQVE7UUFFZCxlQUFVLEdBQVYsVUFBVSxDQUFRO1FBRWxCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFFZCxRQUFHLEdBQUgsR0FBRyxDQUFRO1FBRVgsYUFBUSxHQUFSLFFBQVEsQ0FBUTtRQUd6QixJQUFJLENBQUMsSUFBSSxHQUFHLFdBQVcsQ0FBQztJQUMxQixDQUFDO0NBQ0Y7QUFFRCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQztBQUNsQyxNQUFNLGVBQWUsR0FBRyxDQUFDLENBQUM7QUFDMUIsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLENBQUM7QUFFL0IsbUNBQW1DO0FBQ25DLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFakUsTUFBTSxPQUFPLFdBQVc7SUFDTCxPQUFPLENBQVU7SUFDakIsY0FBYyxDQUF5QjtJQUN2QyxTQUFTLENBQVM7SUFDbEIsT0FBTyxDQUFTO0lBQ2hCLGNBQWMsQ0FBUztJQUN2QixNQUFNLENBQVc7SUFFbEMsNkNBQTZDO0lBQzVCLFFBQVEsR0FBRyxJQUFJLEdBQUcs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