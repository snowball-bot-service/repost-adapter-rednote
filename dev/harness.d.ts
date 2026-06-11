import type { Adapter, RepostAdapterResponsePayload } from '@snowball-bot/repost-adapter';
/**
 * 模拟核心的最小宿主环境，用于在 starter 项目本地调试 adapter，
 * 无需启动真正的 core。
 *
 * 行为差异：
 * - 不实现路由（所有 emitRepost 都直接交给已注册的 adapter）
 * - 不实现 provider/host 冲突检测
 * - config 由 harness 构造时传入，模拟 core 注入
 */
export declare class MockAdapterHost {
    private readonly config;
    private handler;
    private adapter;
    constructor(config?: Record<string, unknown>);
    /**
     * 注册 adapter，触发其 initState
     */
    register(adapter: Adapter): Promise<void>;
    /**
     * 模拟核心收到消息后的转发触发
     */
    emitRepost(url: string): Promise<RepostAdapterResponsePayload | null>;
    /**
     * 释放
     */
    dispose(): Promise<void>;
    private buildContext;
}
