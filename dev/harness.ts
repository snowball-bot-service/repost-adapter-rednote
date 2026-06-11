import type {
  Adapter,
  AdapterContext,
  AdapterProcessRequestParams,
  AdapterProcessResponsePayload,
  AdapterRepostRequestParams,
  AdapterRepostResponsePayload,
  ProcessHandler,
  ProcessMethod,
  RepostHandler,
} from '@snowball-bot/repost-adapter';

/**
 * 模拟核心的最小宿主环境，用于在 starter 项目本地调试 adapter，
 * 无需启动真正的 core。
 *
 * 行为差异：
 * - 不实现路由（所有 emitRepost 都直接交给已注册的 adapter）
 * - 不实现 provider/host 冲突检测
 * - config 由 harness 构造时传入，模拟 core 注入
 */
/**
 * 将数字格式化为人类可读，如 1.2K / 3M（mimic core helper）
 */
function humanableNumber(num: number): string {
  if (Math.abs(num) < 1000) return String(num);
  const units = ['K', 'M', 'B', 'T'];
  let value = num;
  let unitIndex = -1;
  while (Math.abs(value) >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return `${parseFloat(value.toFixed(1))}${units[unitIndex]}`;
}

export class MockAdapterHost {
  private repostHandler: RepostHandler | null = null;
  private processHandler: ProcessHandler | null = null;
  private adapter: Adapter | null = null;

  constructor(
    private readonly config: Record<string, unknown> = {}
  ) {}

  /**
   * 注册 adapter，触发其 initState
   */
  async register(adapter: Adapter): Promise<void> {
    if (this.adapter) {
      throw new Error('MockAdapterHost only supports one adapter at a time');
    }
    this.adapter = adapter;

    const ctx = this.buildContext();
    await adapter.initState(ctx);

    if (!this.repostHandler) {
      throw new Error(
        `Adapter ${adapter.manifest.name} did not register an onRepostRequest handler`
      );
    }

    console.log(`✓ Registered ${adapter.manifest.name} (${adapter.manifest.provider})`);
    console.log(`  whitelistHosts: ${adapter.manifest.whitelistHosts.join(', ')}`);
  }

  /**
   * 模拟核心收到消息后的转发触发
   */
  async emitRepost(url: string): Promise<AdapterRepostResponsePayload | null> {
    if (!this.repostHandler || !this.adapter) {
      throw new Error('No adapter registered');
    }

    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // 验证 host 命中 whitelistHosts（mimic core 路由）
    if (!this.adapter.manifest.whitelistHosts.includes(host)) {
      console.warn(
        `⚠ URL host "${host}" not in adapter's whitelistHosts. ` +
        `Real core would not route this to your adapter.`
      );
    }

    const req: AdapterRepostRequestParams = {
      source: url,
      code: `dev-${Date.now()}`,
      requester: {
        userId: '-1',
        nickname: 'DEVELOPER'
      },
    };

    console.log(`\n→ emitRepost: ${url}`);
    const result = await this.repostHandler(req);
    console.log(`← response:`, result);
    return result;
  }

  /**
   * 模拟核心收到下一步进程触发（🍓 / 🍉 / 🍎）
   *
   * @param method 进程代号（strawberry / watermelon / apple）
   * @param source 进程入参，通常是上一步 response 中携带的 ID
   */
  async emitProcess(
    method: ProcessMethod,
    source: string
  ): Promise<AdapterProcessResponsePayload | null> {
    if (!this.processHandler || !this.adapter) {
      throw new Error(
        'No onProcessRequest handler registered. ' +
        'Call ctx.on("onProcessRequest", ...) in your adapter\'s initState.'
      );
    }

    const req: AdapterProcessRequestParams = {
      method,
      source,
      code: `dev-${Date.now()}`,
      requester: {
        userId: '-1',
        nickname: 'DEVELOPER'
      },
    };

    console.log(`\n→ emitProcess(${method}): ${source}`);
    const result = await this.processHandler(req);
    console.log(`← response:`, result);
    return result;
  }

  /**
   * 释放
   */
  async dispose(): Promise<void> {
    await this.adapter?.dispose?.();
  }

  private buildContext(): AdapterContext {
    return {
      on: (event, handler) => {
        switch (event) {
          case 'onRepostRequest':
            if (this.repostHandler) {
              throw new Error('onRepostRequest handler already registered');
            }
            this.repostHandler = handler as RepostHandler;
            break;
          case 'onProcessRequest':
            if (this.processHandler) {
              throw new Error('onProcessRequest handler already registered');
            }
            this.processHandler = handler as ProcessHandler;
            break;
          default:
            throw new Error(`Unknown event: ${event}`);
        }
      },
      config: <T = unknown>(key: string) => this.config[key] as T | undefined,
      helper: {
        pick: (record, key, fallback) => record[key] ?? fallback!,
        extraHumanable: (prefix, number, suffix) =>
          `${prefix}${humanableNumber(number)}${suffix}`,
        humanableDuration: (duration, forceHours = false) => {
          const total = Math.max(0, Math.floor(duration));
          const hours = Math.floor(total / 3600);
          const minutes = Math.floor((total % 3600) / 60);
          const seconds = total % 60;
          const pad = (n: number) => String(n).padStart(2, '0');
          return hours > 0 || forceHours
            ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
            : `${pad(minutes)}:${pad(seconds)}`;
        },
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
