import 'dotenv/config'; // 自动加载 .env 文件
import adapter from '../src';
import { MockAdapterHost } from './harness';
async function main() {
    // 从环境变量构造 config，模拟 core 注入密钥
    const host = new MockAdapterHost({
        apiKey: process.env.MY_API_KEY,
        // 你 adapter 需要的其他配置都在这里塞
    });
    await host.register(adapter);
    // 测试 URL 列表：随便改、随便加
    const testUrls = [
        'https://example.com/posts/12345',
        'https://example.com/posts/67890',
        // 'https://twitter.com/x/status/123',  // 测错误情况：非 whitelistHosts
    ];
    for (const url of testUrls) {
        try {
            await host.emitRepost(url);
        }
        catch (err) {
            console.error(`✗ Failed:`, err);
        }
    }
    await host.dispose();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheWdyb3VuZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBsYXlncm91bmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxlQUFlLENBQUMsQ0FBRyxlQUFlO0FBQ3pDLE9BQU8sT0FBTyxNQUFNLFFBQVEsQ0FBQztBQUM3QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRTVDLEtBQUssVUFBVSxJQUFJO0lBQ2pCLDhCQUE4QjtJQUM5QixNQUFNLElBQUksR0FBRyxJQUFJLGVBQWUsQ0FBQztRQUMvQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVO1FBQzlCLHlCQUF5QjtLQUMxQixDQUFDLENBQUM7SUFFSCxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFN0Isb0JBQW9CO0lBQ3BCLE1BQU0sUUFBUSxHQUFHO1FBQ2YsaUNBQWlDO1FBQ2pDLGlDQUFpQztRQUNqQyxpRUFBaUU7S0FDbEUsQ0FBQztJQUVGLEtBQUssTUFBTSxHQUFHLElBQUksUUFBUSxFQUFFO1FBQzFCLElBQUk7WUFDRixNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDNUI7UUFBQyxPQUFPLEdBQUcsRUFBRTtZQUNaLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1NBQ2pDO0tBQ0Y7SUFFRCxNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUN2QixDQUFDO0FBRUQsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7SUFDbkIsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xCLENBQUMsQ0FBQyxDQUFDIn0=