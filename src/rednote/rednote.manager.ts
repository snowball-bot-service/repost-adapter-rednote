import type { ILogger } from '@snowball-bot/repost-adapter';
import { HttpManager } from '../utils/http';
import { NoteData, XhsFeedPayload, XhsReadData } from './rednote.type';
import { XhsCli } from './xhs-cli';
import { XhsCliException } from '../utils/error';

/**
 * 浏览器 User-Agent。
 * 短链跳转依赖 UA, 缺失时小红书可能返回非标准页面。
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** {@link RednoteManager} 构造配置 */
export interface RednoteManagerOptions {
  /** 本项目的 HTTP 客户端 (基于 fetch), 仅用于短链跳转 */
  http: HttpManager;
  /** xhs CLI 封装, 用于笔记解析 */
  cli: XhsCli;
  /** 日志器 (通常传入 ctx.logger) */
  logger?: ILogger;
}

/**
 * 小红书工具类。
 *
 *   - 短链 -> 长链: 走 HTTP 跟随 302, 拿到带 xsec_token 的真实链接
 *   - 笔记解析: 调用 `xhs read <URL> --json`, 归一化为 {@link NoteData}
 */
export class RednoteManager {
  private readonly http: HttpManager;
  private readonly cli: XhsCli;
  private readonly logger?: ILogger;

  constructor(options: RednoteManagerOptions) {
    this.http = options.http;
    this.cli = options.cli;
    this.logger = options.logger;
  }

  /**
   * 将短链 (xhslink.cn/o/{code}) 解析为长链 (含 xsec_token 等查询参数)
   * @param link 短链
   * @return 长链
   */
  public async resolveShortLink(link: string): Promise<string> {
    const response = await this.http.get(link, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    let resolved = response.url;

    // 需要先登录后才能重定向时，直接拿 queryParam = redirectPath
    if (resolved.includes('www.xiaohongshu.com/login')) {
      const redirect = new URL(resolved);
      resolved = (redirect.searchParams.get('redirectPath') ?? '/').replace(
        'http://',
        'https://'
      );
    }

    if (!new URL(resolved).searchParams.get('xsec_token')) {
      this.logger?.warn(
        `[rednote] resolved link has no xsec_token: ${resolved}`
      );
    }

    return resolved;
  }

  /**
   * 通过 CLI 解析笔记
   * @param link 笔记长链 (需含 xsec_token)
   * @return 归一化后的笔记数据
   * @throws XhsCliException CLI 调用失败 / 负载中无笔记
   */
  public async readNote(link: string): Promise<NoteData> {
    const data = await this.cli.run<XhsReadData>(['read', link]);
    const note = pickRawNote(data);
    if (!note) {
      throw new XhsCliException('note_not_found', `no note in response: ${link}`);
    }
    return camelizeKeys(note) as NoteData;
  }
}

/**
 * 从 `xhs read` 的 data 中取出原始笔记对象。
 *   - feed API: data.items[].note_card (snake_case)
 *   - HTML 兜底: data 本身即笔记 (camelCase)
 */
function pickRawNote(data: XhsReadData): Record<string, unknown> | null {
  if (Array.isArray((data as XhsFeedPayload).items)) {
    const items = (data as XhsFeedPayload).items;
    const item = items.find((i) => i.model_type === 'note') ?? items[0];
    return item?.note_card ?? null;
  }
  if (data && typeof data === 'object' && 'noteId' in data) {
    return data;
  }
  return null;
}

/** snake_case -> camelCase */
function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** 递归将对象键名转为 camelCase (已是 camelCase 的键保持不变) */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [toCamel(k), camelizeKeys(v)])
    );
  }
  return value;
}
