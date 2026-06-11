import { FetchHandleDataFailedException } from "./utils/error";
/**
 * 将 URL 转换成 URL payload
 * @param source
 */
export function extractURL(source) {
    return new URL(source);
}
/**
 * 提取 Source URL 中的 Handle ID (PostId, UserId, ...)
 * @param source 原始 URL
 * @param numberOfPath 提取 Path 路径中的第几个，从 0 开始
 * @example Path: /post/114514 => numberOfPath: 1 => 114514
 */
export function extractHandleId(source, numberOfPath) {
    const { pathname } = extractURL(source);
    const paths = pathname.split("/");
    // 如果分割的 Paths 首个为空，则删除
    if (paths.length > 1 && paths[0].length === 0) {
        paths.shift();
    }
    return ["post", paths[numberOfPath]];
}
/**
 * 进行对应的 API 请求，拿到 Handle Data
 * @param http
 * @param method
 * @param handleId
 */
export async function fetchHandleDataFromAPI(http, method, handleId) {
    switch (method) {
        case "post":
            break;
        case "profile":
            break;
        case "live":
            break;
    }
    throw new FetchHandleDataFailedException(method, handleId, "No valid method matches.");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFDLDhCQUE4QixFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRTdEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxVQUFVLENBQUMsTUFBYztJQUN2QyxPQUFPLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3pCLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQzdCLE1BQWMsRUFBRSxZQUFvQjtJQUVwQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFbEMsdUJBQXVCO0lBQ3ZCLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDN0MsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0tBQ2Y7SUFFRCxPQUFPLENBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBRSxDQUFDO0FBQ3pDLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsc0JBQXNCLENBQzFDLElBQWlCLEVBQUUsTUFBb0IsRUFBRSxRQUFnQjtJQUV6RCxRQUFRLE1BQU0sRUFBRTtRQUNkLEtBQUssTUFBTTtZQUNULE1BQU07UUFDUixLQUFLLFNBQVM7WUFDWixNQUFNO1FBQ1IsS0FBSyxNQUFNO1lBQ1QsTUFBTTtLQUNUO0lBRUQsTUFBTSxJQUFJLDhCQUE4QixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUN6RixDQUFDIn0=