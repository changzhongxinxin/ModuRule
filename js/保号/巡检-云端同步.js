/**
 * Emby 保号 - 定时巡检 (Gist 云端版)
 * 新增：网络请求失败自动重试机制（最大重试1次，延迟1秒）
 */

// ========== 从 $argument 解析配置 ==========
let arg = {};
try {
    if (typeof $argument !== 'undefined' && $argument) {
        arg = Object.fromEntries(new URLSearchParams($argument));
    }
} catch (e) {}

const GIST = {
    baseUrl: arg.gistUrl || "https://api.github.com",
    ownerToken: arg.Token || "",
    gistDescription: arg.gistDescription || "Emby Keepalive Data",
    gistFilename: arg.gistFilename || "emby_keepalive_data.json"
};

// ========== Gist 读取 (附带重试逻辑) ==========
const readHeartbeatFromCloud = (callback, retryCount = 0) => {
    $httpClient.get({
        url: `${GIST.baseUrl}/gists`,
        headers: {
            "Authorization": `token ${GIST.ownerToken}`,
            "Accept": "application/json"
        }
    }, (err, resp, listData) => {
        // 第一步：请求列表失败拦截
        if (err || !listData) {
            console.log(`读取 Gist 列表失败 (第 ${retryCount + 1} 次尝试): ${err || "无响应"}`);
            if (retryCount < 1) {
                console.log("1秒后将进行重试...");
                setTimeout(() => readHeartbeatFromCloud(callback, retryCount + 1), 1000);
                return;
            }
            callback(null, `已连续失败2次，读取 Gist 列表失败: ${err || "无响应"}`);
            return;
        }
        
        let gists;
        try {
            gists = JSON.parse(listData);
        } catch (e) {
            callback(null, "解析 Gist 列表失败");
            return;
        }
        
        const targetGist = gists.find(g => g.description === GIST.gistDescription);
        if (!targetGist) {
            callback(null, "云端暂无数据，请先触发 Stop 请求");
            return;
        }
        
        $httpClient.get({
            url: `${GIST.baseUrl}/gists/${targetGist.id}`,
            headers: {
                "Authorization": `token ${GIST.ownerToken}`,
                "Accept": "application/json"
            }
        }, (err2, resp2, detailData) => {
            // 第二步：请求详情失败拦截
            if (err2 || !detailData) {
                console.log(`读取 Gist 详情失败 (第 ${retryCount + 1} 次尝试): ${err2 || "无响应"}`);
                if (retryCount < 1) {
                    console.log("1秒后将进行重试...");
                    setTimeout(() => readHeartbeatFromCloud(callback, retryCount + 1), 1000);
                    return;
                }
                callback(null, `已连续失败2次，读取 Gist 详情失败: ${err2 || "无响应"}`);
                return;
            }
            
            try {
                const gist = JSON.parse(detailData);
                
                // ========== 修复：使用 gistFilename 定位文件 ==========
                let filename = GIST.gistFilename;
                let fileObj = gist.files[filename];
                
                // 如果指定文件名不存在，fallback 到第一个文件
                if (!fileObj) {
                    const filenames = Object.keys(gist.files);
                    if (filenames.length > 0) {
                        filename = filenames[0];
                        fileObj = gist.files[filename];
                    }
                }
                
                if (!fileObj) {
                    callback(null, "Gist 中没有文件");
                    return;
                }
                
                const content = fileObj.content;
                callback(JSON.parse(content), null);
            } catch (e) {
                callback(null, "解析 Gist 数据失败: " + e.message);
            }
        });
    });
};

// ========== 主逻辑 ==========
(() => {
    if (!GIST.baseUrl || !GIST.ownerToken) {
        $notification.post("Emby 巡检", "配置错误", "缺少 Gist 参数");
        return $done();
    }

    readHeartbeatFromCloud((data, errorMsg) => {
        if (errorMsg) {
            $notification.post("Emby 巡检", "云端获取失败", errorMsg);
            return $done();
        }
        
        if (!data || Object.keys(data).length === 0) {
            $notification.post("Emby 保号", "暂无数据", "请先播放视频触发 Stop 请求");
            return $done();
        }
        
        const servers = Object.keys(data);
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const alerts = [];
        const normal = [];
        
        for (const name of servers) {
            const info = data[name];
            const days = info?.days || 25;
            const lastStr = info?.lastBeat;
            
            if (!lastStr) {
                alerts.push(`⚠️ ${name}\n   从未触发（请先看一个视频）`);
                continue;
            }
            
            const datePart = lastStr.split(' ')[0];
            const [y, m, d] = datePart.split('-').map(Number);
            const lastDate = new Date(y, m - 1, d);
            const diffDays = Math.floor((today - lastDate) / 86400000);
            
            if (diffDays > days) {
                alerts.push(`🚨 ${name}\n   已 ${diffDays} 天未活跃（限 ${days} 天）\n   最后观看: ${lastStr}`);
            } else {
                const remain = days - diffDays;
                normal.push(`✅ ${name}: 剩 ${remain} 天 (最后观看${lastStr})`);
            }
        }
        
        if (alerts.length > 0) {
            $notification.post(
                "🚨 Emby 保号提醒",
                `${alerts.length} 个账号需关注`,
                alerts.join("\n\n") + (normal.length ? "\n\n———\n" + normal.join("\n") : "")
            );
        } else {
            console.log("[Emby巡检] 全部正常\n" + normal.join("\n"));
        }
        
        $done();
    });
})();
