import { HttpManager } from './utils/http';
import { extractHandleId, fetchHandleDataFromAPI } from "./manager";
export { HttpManager, HttpError } from './utils/http';
/**
 * 常量仓库
 * @param apiBaseURL API 基础地址
 * @param provider 提供商
 * @param apiTimeout API 超时时间（毫秒）
 * @param apiRetries API 重试次数
 */
const CONST = {
    provider: "REPLACE_ME",
    apiBaseURL: "https://example.com",
    apiTimeout: 5000,
    apiRetries: 1,
};
/**
 * 实例仓库
 * @param instance.http 模块级 HTTP 客户端, 在 initState 中创建, dispose 中销毁
 * */
const INSTANCE = {
    http: null,
};
const adapter = {
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
    async initState(ctx) {
        // 读取配置（可选）。配置由核心通过 `ctx.config(key)` 提供。
        // 比如 API key、限流参数等，建议把所有可调项都从 config 取。
        const apiKey = ctx.config('apiKey');
        if (!apiKey) {
            ctx.logger.warn(`[${CONST.provider}] no apiKey configured, falling back to public API`);
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
        ctx.on('onRepostRequest', (req) => handle(req, ctx, { apiKey }));
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
async function handle(req, ctx, options) {
    ctx.logger.debug(`[${CONST.provider}] fetching ${req.source}`);
    // TODO: 1) 从 req.source 解析出 Handle Id
    const [handleMethod, handleId] = extractHandleId(req.source, 1);
    // TODO: 2) 调用平台 API 拿到原始数据
    const handleData = await fetchHandleDataFromAPI(INSTANCE.http, handleMethod, handleId);
    const postId = "";
    const publishAt = new Date();
    const requesterUserId = "";
    const requesterNickname = "";
    const authorNickname = "";
    // TODO: 3) 转换成标准 response 格式
    return {
        code: req.code,
        provider: CONST.provider,
        originalUrl: req.source,
        method: "post",
        postId: postId,
        publishAt: publishAt,
        requester: {
            userId: requesterUserId,
            nickname: requesterNickname,
        },
        author: {
            nickname: authorNickname,
        },
        title: "",
        content: `TODO: real content from ${req.source}`,
        cover: "",
        images: [],
        overlayCoverBuffer: undefined,
        child: undefined,
        badges: [],
        strawberry: undefined,
        watermelon: undefined,
        useProxy: false,
        useTranslator: false,
        canvasWidth: undefined,
        extra: undefined,
    };
}
export default adapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFNQSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQzNDLE9BQU8sRUFBQyxlQUFlLEVBQWMsc0JBQXNCLEVBQUMsTUFBTSxXQUFXLENBQUM7QUFFOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxjQUFjLENBQUM7QUEwQnREOzs7Ozs7R0FNRztBQUNILE1BQU0sS0FBSyxHQUtQO0lBQ0YsUUFBUSxFQUFFLFlBQVk7SUFDdEIsVUFBVSxFQUFFLHFCQUFxQjtJQUNqQyxVQUFVLEVBQUUsSUFBSTtJQUNoQixVQUFVLEVBQUUsQ0FBQztDQUNkLENBQUE7QUFFRDs7O0tBR0s7QUFDTCxNQUFNLFFBQVEsR0FFVjtJQUNGLElBQUksRUFBRSxJQUFJO0NBQ1gsQ0FBQTtBQUVELE1BQU0sT0FBTyxHQUFZO0lBQ3ZCLFFBQVEsRUFBRTtRQUNSLElBQUksRUFBRSxrQkFBa0IsS0FBSyxDQUFDLFFBQVEsRUFBRTtRQUN4QyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7UUFDeEIsY0FBYyxFQUFFLENBQUMsYUFBYSxDQUFDO1FBQy9CLE9BQU8sRUFBRSxDQUFDO1FBQ1YsTUFBTSxFQUFFLFlBQVk7UUFDcEIsT0FBTyxFQUFFO1lBQ1AsSUFBSSxFQUFFLEdBQUc7WUFDVCxLQUFLLEVBQUUsR0FBRztZQUNWLEtBQUssRUFBRSxJQUFJO1lBQ1gsS0FBSyxFQUFFLENBQUM7U0FDVDtRQUNELFlBQVksRUFBRTtZQUNaLElBQUksRUFBRSxZQUFZO1lBQ2xCLElBQUksRUFBRSxHQUFHO1lBQ1QsS0FBSyxFQUFFLFNBQVM7WUFDaEIsT0FBTyxFQUFFLFNBQVM7U0FDbkI7S0FDRjtJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBbUI7UUFDakMseUNBQXlDO1FBQ3pDLHdDQUF3QztRQUN4QyxNQUFN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