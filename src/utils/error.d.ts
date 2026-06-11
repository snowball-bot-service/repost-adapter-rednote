import { RepostMethod } from "@snowball-bot/repost-adapter";
export declare abstract class SnowballException extends Error {
    protected constructor(message: string);
}
/**
 * 获取 Handle Data 失败错误
 */
export declare class FetchHandleDataFailedException extends SnowballException {
    readonly method: RepostMethod;
    readonly handleId: string;
    readonly msg: string;
    constructor(method: RepostMethod, handleId: string, msg: string);
}
