import 'dotenv/config';   // 自动加载 .env 文件
import adapter from '../src';
import { MockAdapterHost } from './harness';
import * as process from 'node:process';

async function main() {
  const host = new MockAdapterHost({
    userAgent: process.env.USER_AGENT,
    rednoteCookie: process.env.REDNOTE_COOKIE,
  });

  await host.register(adapter);

  // 测试 URL 列表：随便改、随便加
  const testUrls = [
    'https://xhslink.cn/o/9yaP2clOLEX',
    // 'https://www.xiaohongshu.com/explore/6aa8ad10000000002601f55b?xsec_token=ABD-IFKekYSUZ9-pAuUhITZo6QMFKnJbWblKvl_AsSRMk='
  ];

  for (const url of testUrls) {
    try {
      const res = await host.emitRepost(url);

      // 转发 post 后，模拟用户点 🍓 触发 strawberry 进程（取原图）
      // if (res?.method === 'post' && res.strawberry) {
      //   await host.emitProcess('strawberry', res.method, res.postId);
      // }
    } catch (err) {
      console.error(`✗ Failed:`, err);
    }
  }

  await host.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
