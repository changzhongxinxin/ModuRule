/**
 * @fileoverview MiniApp 自动签到脚本 (Surge)
 * 流程：读取持久化 initData → 调用登录接口换取 sid → 使用 sid 签到
 */

const title = "MiniApp 签到";

// 从持久化存储读取 initData（由捕获脚本写入）
const initData = $persistentStore.read("MiniApp");

if (!initData) {
    console.log(`${title} 异常: 找不到 initData，请先获取并写入 Key 为 "MiniApp" 的值。`);
    $notification.post(title, "未找到 initData ⚠️", "请先配置并写入 initData 到存储中");
    $done();
    return;
}

// 通用请求头，还原浏览器指纹
const commonHeaders = {
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": "gzip, br, zstd",
    "Content-Type": "application/json",
    "Origin": "https://miniapp.ftp2.eu.org",
    "Referer": "https://miniapp.ftp2.eu.org/",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "Priority": "u=3, i",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
};

// 第一步：用 initData 登录换取 sid
const loginRequest = {
    url: "https://miniapp.ftp2.eu.org/api/auth/telegram",
    headers: commonHeaders,
    body: JSON.stringify({ initData: initData })
};

$httpClient.post(loginRequest, function(error, response, data) {
    if (error) {
        console.log(`${title} 登录请求失败: ${error}`);
        $notification.post(title, "登录失败 ❌", "网络错误，请查看日志了解详情");
        $done();
        return;
    }

    let sid = "";
    try {
        const obj = JSON.parse(data);
        if (obj.ok && obj.data && obj.data.sid) {
            sid = obj.data.sid;
            console.log(`${title} 登录成功，获取到 sid: ${sid}`);
        } else {
            const msg = obj.message || "登录接口返回异常";
            console.log(`${title} 登录失败: ${data}`);
            $notification.post(title, "登录失败 ❌", msg);
            $done();
            return;
        }
    } catch (e) {
        console.log(`${title} 登录响应解析失败: ${e}\n响应数据: ${data}`);
        $notification.post(title, "登录解析失败 ❌", "服务器返回数据格式异常");
        $done();
        return;
    }

    // 第二步：使用刚获取的 sid 进行签到（不持久化 sid）
    const checkinHeaders = {
        ...commonHeaders,
        "X-Session": sid,
        "Cookie": `qp_session=${sid}`
    };

    const checkinRequest = {
        url: "https://miniapp.ftp2.eu.org/api/user/checkin",
        headers: checkinHeaders
    };

    $httpClient.post(checkinRequest, function(error2, response2, data2) {
        if (error2) {
            console.log(`${title} 签到请求失败: ${error2}`);
            $notification.post(title, "签到失败 ❌", "网络错误，请查看日志了解详情");
            $done();
            return;
        }

        try {
            const obj = JSON.parse(data2);
            if (obj.ok) {
                const msg = obj.message || "签到成功";
                const newScore = obj.data && obj.data.newScore ? `当前总积分: ${obj.data.newScore}` : "";
                $notification.post(title, "签到成功 🎉", `${msg}\n${newScore}`);
                console.log(`${title} 签到成功: ${data2}`);
            } else {
                const msg = obj.message || "未知状态";
                if (msg.includes("请先登录") || msg.includes("失效") || msg.includes("过期") || msg.includes("Unauthorized")) {
                    $notification.post(title, "CK 失效 ❌", `${msg}，请重新获取 initData 并更新`);
                    console.log(`${title} CK 失效: ${data2}`);
                } else {
                    $notification.post(title, "签到提示 ⚠️", msg);
                    console.log(`${title} 签到异常: ${data2}`);
                }
            }
        } catch (e) {
            console.log(`${title} 签到响应解析失败: ${e}\n响应数据: ${data2}`);
            $notification.post(title, "签到解析失败 ❌", "服务器返回数据格式异常");
        }
        
        $done();
    });
});
