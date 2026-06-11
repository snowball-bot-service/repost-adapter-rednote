import {HttpManager} from "./utils/http";
import {RepostMethod} from "@snowball-bot/repost-adapter";

/**
 * 将 URL 转换成 URL payload
 * @param source
 */
export function extractURL(source: string) {
  return new URL(source);
}

/**
 * 提取 Source URL 中的 Handle ID (PostId, UserId, ...)
 * @param source 原始 URL
 * @example Path: /post/114514 => numberOfPath: 1 => 114514
 */
export function extractHandleId(source: string): [RepostMethod?, string?] {
  const { pathname } = extractURL(source);
  const paths = pathname.split('/') as [string, string, string?];

  // 如果分割的 Paths 首个为空，则删除
  if (paths.length > 1 && paths[0].length === 0) {
    paths.shift();
  }

  const [type, tree2, tree3] = paths;

  switch (type) {
    case 'post':
      return ['post', tree3!];
    case 'user':
      return ['profile', tree2];
    case "live":
      return ['live', tree3!];
  }

  return [];
}

type RepostMethodPayloadMap = {
  post: unknown;
  profile: unknown;
  live: unknown;
}

/**
 * method -> API 抓取函数 的注册表。
 *
 * 每一项要么是对应的抓取函数, 要么是 `null` (表示该渠道不支持此 method)。
 * `satisfies` 在此处校验每个 handler 的返回类型与 {@link RepostMethodPayloadMap}
 * 对应项一致；任何不匹配都会在此对象上直接报错，而非在调用处。
 */
const PAYLOAD_FETCHERS = {
  post: async (http: HttpManager, handleId: string) => Promise<unknown>,
  profile: async (http: HttpManager, handleId: string) => Promise<unknown>,
  live: async (http: HttpManager, handleId: string) => Promise<unknown>,
} satisfies {
  [M in RepostMethod]:
  | ((http: HttpManager, handleId: string) => Promise<RepostMethodPayloadMap[M]>)
  | null;
};

/**
 * 进行对应的 API 请求，拿到 Handle Data
 * @param http
 * @param method
 * @param handleId
 */
export async function fetchHandleDataFromAPI<M extends RepostMethod>(
  http: HttpManager,
  method: M,
  handleId: string
): Promise<RepostMethodPayloadMap[M]> {
  const fetcher = PAYLOAD_FETCHERS[method] as
    | ((http: HttpManager, handleId: string) => Promise<RepostMethodPayloadMap[M]>)
    | null;

  // null 项: 该渠道不支持此 method (eg. live), 返回 null 回调
  if (!fetcher) {
    return null as RepostMethodPayloadMap[M];
  }

  return fetcher(http, handleId);
}
