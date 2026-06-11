import * as vm from "node:vm";
import type { ILogger } from "@snowball-bot/repost-adapter";
import { HttpManager } from "../utils/http";
import { RednoteItemRootPayload } from "./rednote.type";

/** 匿名 Cookie 缓存时长（24 小时，毫秒） */
const COOKIE_TTL_MS = 24 * 60 * 60 * 1000;

/** 小红书首页地址，用于获取匿名 Cookie */
export const HOMEPAGE_URL = "https://www.xiaohongshu.com/";

/**
 * 浏览器 User-Agent。
 * 小红书需要带 UA 才会返回内嵌 `__INITIAL_STATE__` 的 HTML，
 * 这一点原 Midway axios 客户端由默认头隐式提供，迁移后必须显式补上。
 */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** {@link RednoteManager} 构造配置 */
export interface RednoteManagerOptions {
  /** 本项目的 HTTP 客户端 (基于 fetch) */
  http: HttpManager;
  /** 日志器 (通常传入 ctx.logger) */
  logger?: ILogger;
}

/**
 * 小红书工具类。
 *
 * 由 Midway 版本 (`rednote-midway`) 改造而来，去除了框架依赖：
 *   - 用本项目的 {@link HttpManager} 替代 `@midwayjs/axios` 的 HttpService
 *   - 用进程内 TTL 缓存替代 CachedManager 做匿名 Cookie 缓存
 *
 * 核心能力：抓取笔记页 HTML → 解析内嵌的 `window.__INITIAL_STATE__` → 返回结构化负载。
 */
export class RednoteManager {
  private readonly http: HttpManager;
  private readonly logger?: ILogger;

  /** 匿名 Cookie 的进程内缓存 */
  private cookieCache: { value: string; expireAt: number } | null = null;

  constructor(options: RednoteManagerOptions) {
    this.http = options.http;
    this.logger = options.logger;
  }

  /**
   * 将小红书链接解析成消息负载
   * @param link 笔记页绝对 URL
   * @return 成功返回负载，失败返回 null
   */
  public async fetchNoteToPayload(
    link: string
  ): Promise<RednoteItemRootPayload | null> {
    try {
      const cookie = await this.getAnonymousCookies();
      this.logger?.debug("REDNOTE COOKIE", cookie);
      const html = await this.http.getText(link, {
        headers: {
          Cookie: cookie,
          "User-Agent": BROWSER_UA,
        },
      });
      return this.parseGlobalInitialState(html);
    } catch (e) {
      this.logger?.error(`[rednote] fetchNoteToPayload failed: ${String(e)}`);
      return null;
    }
  }

  /**
   * 获取 HTML 里的 __INITIAL_STATE__ 并解析成对象
   * @param html
   * @private
   * @return 成功返回对象，失败返回 null
   */
  private parseGlobalInitialState(
    html: string
  ): RednoteItemRootPayload | null {
    try {
      const match = html.match(
        /window\.__INITIAL_STATE__\s*=\s*(\{.*?}<\/script>)/s
      );

      if (match) {
        const script =
          "window.__INITIAL_STATE__ = " + match[1].replace("</script>", "");
        const sandbox: { window: Record<string, unknown> } = {
          window: {},
        };
        vm.createContext(sandbox);
        vm.runInContext(script, sandbox);
        return sandbox.window.__INITIAL_STATE__ as RednoteItemRootPayload;
      } else {
        this.logger?.error("[rednote] Not match HTML");
        return null;
      }
    } catch (e) {
      this.logger?.error(`[rednote] parseGlobalInitialState failed: ${String(e)}`);
      return null;
    }
  }

  /**
   * 获取 / 生成匿名 Cookies。
   * 命中未过期的进程内缓存则直接返回，否则在线拉取并缓存 24 小时。
   * @private
   */
  private async getAnonymousCookies(): Promise<string> {
    try {
      const now = Date.now();

      // 命中未过期缓存则直接返回
      if (this.cookieCache && this.cookieCache.expireAt > now) {
        return this.cookieCache.value;
      }

      // 缓存缺失 / 过期，在线获取
      const response = await this.http.get(HOMEPAGE_URL, {
        headers: { "User-Agent": BROWSER_UA },
      });
      const cookiesList = response.headers.getSetCookie();

      const newCookies = cookiesList
        .map((cookie) => cookie.split(";")[0])
        .join("; ");

      this.cookieCache = { value: newCookies, expireAt: now + COOKIE_TTL_MS };

      return newCookies;
    } catch (e) {
      this.logger?.warn(`[rednote] getAnonymousCookies failed: ${String(e)}`);
      return "";
    }
  }
}
