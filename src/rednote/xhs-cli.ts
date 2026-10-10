import { execFile, ExecFileException } from 'node:child_process';
import type { ILogger } from '@snowball-bot/repost-adapter';
import { XhsCliException } from '../utils/error';
import { XhsCliResponse } from './rednote.type';

/** {@link XhsCli} 构造配置 */
export interface XhsCliOptions {
  /** 可执行文件路径, DEF: `xhs` (从 PATH 查找) */
  binary?: string;
  /** 单次调用超时 (ms), DEF: 30000 */
  timeoutMs?: number;
  /** 日志器 (通常传入 ctx.logger) */
  logger?: ILogger;
}

const DEFAULT_BINARY = 'xhs';
const DEFAULT_TIMEOUT_MS = 30_000;
/** stdout 上限: 笔记 JSON 通常几十 KB, 留足余量 */
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * xhs CLI 封装 (https://pypi.org/project/xiaohongshu-cli/)。
 *
 * 统一以 `--json` 调用, 解析 `{ ok, schema_version, data | error }` 信封:
 *   - 成功: 返回 data
 *   - 失败: 抛出 {@link XhsCliException}
 *
 * 使用 execFile (不经过 shell), 参数原样传递, 无注入风险。
 */
export class XhsCli {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly logger?: ILogger;

  constructor(options: XhsCliOptions = {}) {
    this.binary = options.binary || DEFAULT_BINARY;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = options.logger;
  }

  /**
   * 执行 `xhs <...args> --json` 并返回 data
   * @param args 子命令及其参数 (不含 --json)
   */
  async run<T>(args: string[]): Promise<T> {
    const fullArgs = [...args, '--json'];
    this.logger?.debug(`[xhs] ${this.binary} ${fullArgs.join(' ')}`);

    const { stdout, stderr, error } = await this.exec(fullArgs);

    // CLI 失败时退出码为 1, 但 stdout 仍是结构化 JSON, 故先尝试解析
    let response: XhsCliResponse<T> | null = null;
    try {
      response = JSON.parse(stdout) as XhsCliResponse<T>;
    } catch {
      // 非 JSON: 进程未能启动 / 超时 / 参数错误等, 下方统一处理
    }

    if (response && typeof response.ok === 'boolean') {
      if (response.ok) return response.data;
      throw new XhsCliException(response.error.code, response.error.message);
    }

    const detail = (stderr || error?.message || stdout).trim().slice(0, 500);
    if (error?.code === 'ENOENT') {
      throw new XhsCliException(
        'cli_not_found',
        `xhs executable not found: ${this.binary}`
      );
    }
    if (error?.killed) {
      throw new XhsCliException(
        'cli_timeout',
        `xhs timed out after ${this.timeoutMs}ms`
      );
    }
    throw new XhsCliException('cli_invalid_output', detail);
  }

  private exec(args: string[]): Promise<{
    stdout: string;
    stderr: string;
    error: ExecFileException | null;
  }> {
    return new Promise((resolve) => {
      execFile(
        this.binary,
        args,
        {
          timeout: this.timeoutMs,
          maxBuffer: MAX_BUFFER,
          windowsHide: true,
          encoding: 'utf8',
          // CLI 为 Python 程序; Windows 默认控制台编码 (GBK) 输出 emoji 会崩溃, 强制 UTF-8
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        },
        (error, stdout, stderr) => resolve({ stdout, stderr, error })
      );
    });
  }
}
