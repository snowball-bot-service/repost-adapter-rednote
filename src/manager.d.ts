import { HttpManager } from "./utils/http";
import { RepostMethod } from "@snowball-bot/repost-adapter";
/**
 * 将 URL 转换成 URL payload
 * @param source
 */
export declare function extractURL(source: string): URL;
/**
 * 提取 Source URL 中的 Handle ID (PostId, UserId, ...)
 * @param source 原始 URL
 * @param numberOfPath 提取 Path 路径中的第几个，从 0 开始
 * @example Path: /post/114514 => numberOfPath: 1 => 114514
 */
export declare function extractHandleId(source: string, numberOfPath: number): [RepostMethod, string];
/**
 * 进行对应的 API 请求，拿到 Handle Data
 * @param http
 * @param method
 * @param handleId
 */
export declare function fetchHandleDataFromAPI<R extends object>(http: HttpManager, method: RepostMethod, handleId: string): Promise<R>;
