import {RepostMethod} from "@snowball-bot/repost-adapter";
import {RednoteManager} from "./rednote/rednote.manager";
import {RednoteItemRootPayload} from "./rednote/rednote.type";

/**
 * 将 URL 转换成 URL payload
 * @param source
 */
export function extractURL(source: string) {
  return new URL(source);
}

/**
 * 提取 Source URL 中的转发模式与 Handle ID。
 *
 * 小红书 Post 链接有两种形态，二者最终抓取到的页面数据一致：
 *   - 长链: `https://www.xiaohongshu.com/discovery/item/{noteId}?...`
 *           (亦常见 `/explore/{noteId}` 形态)
 *   - 短链: `http://xhslink.com/o/{code}` —— URL 内不含 noteId, 仅一个短码,
 *           抓取时 fetch 跟随 302 跳到真实页面拿到同一份数据。
 *
 * 短链无法同步解析出真实 noteId, 故此处返回短码作为临时 id (仅用于通过非空校验),
 * 真实 noteId 由调用方从抓取后的负载 `note.currentNoteId` 取。
 *
 * @param source 原始 URL
 * @return [转发模式, Handle ID]; 无法识别返回空元组
 */
export function extractHandleId(source: string): [RepostMethod?, string?] {
  let url: URL;
  try {
    url = extractURL(source);
  } catch {
    return [];
  }

  // 短链: xhslink.com/.../{code} —— 取路径最后一段作临时 id
  if (url.hostname.includes('xhslink.cn')) {
    const code = url.pathname.split('/').filter(Boolean).pop();
    return code ? ['post', code] : [];
  }

  // 长链: xiaohongshu.com, 按首段路径分流
  const [type, tree2, tree3] = url.pathname.split('/').filter(Boolean);

  switch (type) {
    // /discovery/item/{noteId}
    case 'discovery':
      return tree3 ? ['post', tree3] : [];
    // /explore/{noteId}
    case 'explore':
      return tree2 ? ['post', tree2] : [];
    // /user/profile/{userId} (profile 抓取当前未实现)
    case 'user':
      return tree3 ? ['profile', tree3] : [];
  }

  return [];
}

type RepostMethodPayloadMap = {
  /** 笔记: 解析自页面 __INITIAL_STATE__ 的根负载 */
  post: RednoteItemRootPayload | null;
  /** 用户主页: RednoteManager 暂未实现 */
  profile: null;
  /** 直播: 小红书渠道不支持 */
  live: null;
}

/**
 * method -> 抓取函数 的注册表。
 *
 * 每一项要么是对应的抓取函数, 要么是 `null` (表示该渠道不支持此 method)。
 * 抓取函数接收 {@link RednoteManager} 与笔记**完整链接**(含 xsec_token 等查询参数),
 * 内部走「抓取页面 HTML -> 解析 __INITIAL_STATE__」流程。
 * `satisfies` 在此处校验每个 handler 的返回类型与 {@link RepostMethodPayloadMap}
 * 对应项一致；任何不匹配都会在此对象上直接报错，而非在调用处。
 */
const PAYLOAD_FETCHERS = {
  post: (rednote: RednoteManager, link: string) => rednote.fetchNoteToPayload(link),
  profile: null,
  live: null,
} satisfies {
  [M in RepostMethod]:
  | ((rednote: RednoteManager, link: string) => Promise<RepostMethodPayloadMap[M]>)
  | null;
};

/**
 * 进行对应的抓取，拿到 Handle Data
 * @param rednote 小红书工具类实例
 * @param method 转发模式
 * @param link 笔记完整链接 (通常为 req.source)
 */
export async function fetchHandleDataFromAPI<M extends RepostMethod>(
  rednote: RednoteManager,
  method: M,
  link: string
): Promise<RepostMethodPayloadMap[M]> {
  const fetcher = PAYLOAD_FETCHERS[method] as
    | ((rednote: RednoteManager, link: string) => Promise<RepostMethodPayloadMap[M]>)
    | null;

  // null 项: 该渠道不支持此 method (eg. live / profile), 返回 null 回调
  if (!fetcher) {
    return null as RepostMethodPayloadMap[M];
  }

  return fetcher(rednote, link);
}
