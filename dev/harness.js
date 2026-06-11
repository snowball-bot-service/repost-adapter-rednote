/**
 * 模拟核心的最小宿主环境，用于在 starter 项目本地调试 adapter，
 * 无需启动真正的 core。
 *
 * 行为差异：
 * - 不实现路由（所有 emitRepost 都直接交给已注册的 adapter）
 * - 不实现 provider/host 冲突检测
 * - config 由 harness 构造时传入，模拟 core 注入
 */
export class MockAdapterHost {
    config;
    handler = null;
    adapter = null;
    constructor(config = {}) {
        this.config = config;
    }
    /**
     * 注册 adapter，触发其 initState
     */
    async register(adapter) {
        if (this.adapter) {
            throw new Error('MockAdapterHost only supports one adapter at a time');
        }
        this.adapter = adapter;
        const ctx = this.buildContext();
        await adapter.initState(ctx);
        if (!this.handler) {
            throw new Error(`Adapter ${adapter.manifest.name} did not register an onRepostRequest handler`);
        }
        console.log(`✓ Registered ${adapter.manifest.name} (${adapter.manifest.provider})`);
        console.log(`  whitelistHosts: ${adapter.manifest.whitelistHosts.join(', ')}`);
    }
    /**
     * 模拟核心收到消息后的转发触发
     */
    async emitRepost(url) {
        if (!this.handler || !this.adapter) {
            throw new Error('No adapter registered');
        }
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        // 验证 host 命中 whitelistHosts（mimic core 路由）
        if (!this.adapter.manifest.whitelistHosts.includes(host)) {
            console.warn(`⚠ URL host "${host}" not in adapter's whitelistHosts. ` +
                `Real core would not route this to your adapter.`);
        }
        const req = {
            source: url,
            code: `dev-${Date.now()}`,
            requester: {
                userId: '-1',
                nickname: 'DEVELOPER'
            },
        };
        console.log(`\n→ emitRepost: ${url}`);
        const result = await this.handler(req);
        console.log(`← response:`, result);
        return result;
    }
    /**
     * 释放
     */
    async dispose() {
        await this.adapter?.dispose?.();
    }
    buildContext() {
        return {
            on: (event, handler) => {
                if (event !== 'onRepostRequest') {
                    throw new Error(`Unknown event: ${event}`);
                }
                if (this.handler) {
                    throw new Error('Handler already registered');
                }
                this.handler = handler;
            },
            config: (key) => this.config[key],
            helper: {
                pick: (record, key, fallback) => record[key] ?? fallback,
            },
            logger: {
                info: (msg, ...args) => console.log(`[info]`, msg, ...args),
                warn: (msg, ...args) => console.warn(`[warn]`, msg, ...args),
                error: (msg, ...args) => console.error(`[error]`, msg, ...args),
                debug: (msg, ...args) => console.log(`[debug]`, msg, ...args),
            },
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFybmVzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImhhcm5lc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBU0E7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLE9BQU8sZUFBZTtJQUtQO0lBSlgsT0FBTyxHQUF5QixJQUFJLENBQUM7SUFDckMsT0FBTyxHQUFtQixJQUFJLENBQUM7SUFFdkMsWUFDbUIsU0FBa0MsRUFBRTtRQUFwQyxXQUFNLEdBQU4sTUFBTSxDQUE4QjtJQUNwRCxDQUFDO0lBRUo7O09BRUc7SUFDSCxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQWdCO1FBQzdCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNoQixNQUFNLElBQUksS0FBSyxDQUFDLHFEQUFxRCxDQUFDLENBQUM7U0FDeEU7UUFDRCxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUV2QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDaEMsTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTdCLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQ2IsV0FBVyxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksOENBQThDLENBQy9FLENBQUM7U0FDSDtRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUNwRixPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixPQUFPLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBVztRQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8s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