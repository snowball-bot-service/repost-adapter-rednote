import { Adapter } from '@snowball-bot/repost-adapter';
export { HttpManager, HttpError } from './utils/http';
export type { HttpManagerOptions, HttpRequestOptions, HttpMethod, QueryParams, } from './utils/http';
declare const adapter: Adapter;
export default adapter;
