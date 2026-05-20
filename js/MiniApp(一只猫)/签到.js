/**
 * @fileoverview MiniApp 自动签到脚本 (Surge) - 浏览器指纹完整版
 */

const title = "MiniApp 签到";

const sessionToken = $persistentStore.read("MiniApp");

if (!sessionToken) {
    console.log(`${title} 异常: 找不到 Token，请先获取并写入 Key 为 "MiniApp" 的值。`);
    $notification.post(title, "未找到 Token ⚠️", "请先配置并写入 Cookie/Token 到存储中");
    $done();
} else {
    const request = {
        url: "https://miniapp.ftp2.eu.org/api/user/checkin",
        headers: {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Content-Type": "application/json",
            "Content-Length": "0",
            "Origin": "https://miniapp.ftp2.eu.org",
            "Referer": "https://miniapp.ftp2.eu.org/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            "X-Session": sessionToken,
            "Cookie": `qp_session=${sessionToken}`
        },
        body: ""  // 显式声明空 body，配合 Content-Length: 0
    };

    $httpClient.post(request, function(error, response, data) {
        if (error) {
            console.log(`${title} 请求失败: ${error}`);
            $notification.post(title, "请求失败 ❌", "网络错误，请查看日志了解详情");
            $done();
            return;
        }

        try {
            const obj = JSON.parse(data);
            if (obj.ok) {
                const msg = obj.message || "签到成功";
                const newScore = obj.data && obj.data.newScore ? `当前总积分: ${obj.data.newScore}` : "";
                $notification.post(title, "签到成功 🎉", `${msg}\n${newScore}`);
                console.log(`${title} 成功: ${data}`);
            } else {
                const msg = obj.message || "未知状态";
                if (msg.includes("请先登录") || msg.includes("失效") || msg.includes("过期")) {
                    $notification.post(title, "CK 失效 ❌", `${msg}，请重新获取 Token 并更新`);
                    console.log(`${title} 失效: ${data}`);
                } else {
                    $notification.post(title, "签到提示 ⚠️", msg);
                    console.log(`${title} 异常: ${data}`);
                }
            }
        } catch (e) {
            console.log(`${title} 响应解析失败: ${e}\n响应数据: ${data}`);
            $notification.post(title, "解析失败 ❌", "服务器返回数据格式异常");
        }
        
        $done();
    });
}
