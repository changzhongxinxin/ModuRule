export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 所有拦截条件直接写在一起
    const shouldIntercept = 
      path.includes('/Sessions/Playing') ||        // 播放进度上报
      path.includes('/Items/Resume') ||            // 播放进度恢复/书签
      path.includes('/System/Ext/ServerDomains') || // 线路同步
      (method === 'POST' && /\/Users\/[^/]+\/PlayedItems/.test(path)); // 标记已观看

    if (shouldIntercept) {
      return new Response(JSON.stringify({ 
        info: "Request blocked by filter",
        intercepted_path: path
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    if (!env.ORIGIN_WORKER) {
      return new Response("Service Binding 'ORIGIN_WORKER' is missing.", { status: 500 });
    }

    try {
      return await env.ORIGIN_WORKER.fetch(request);
    } catch (e) {
      return new Response(`Forwarding error: ${e.message}`, { status: 502 });
    }
  }
};