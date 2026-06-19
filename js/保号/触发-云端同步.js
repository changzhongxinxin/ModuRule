/**
 * Emby 保号 - Stop 触发器 (Gist 云端版)
 * 配置源: 脚本内写死（不再读取持久化）
 * 心跳存储: Gist 云端 Gist（JSON）
 * Gist 配置: 从 $argument 传入
 */

// ========== 从 $argument 解析 Gist 配置 ==========
let arg = {};
try {
    if (typeof $argument !== 'undefined' && $argument) {
        arg = Object.fromEntries(new URLSearchParams($argument));
    }
} catch (e) {
    console.log("[Emby保号] ⚠️ $argument 解析失败");
}

const GIST = {
    baseUrl: arg.gistUrl || "https://api.github.com",
    ownerToken: arg.Token || "",
    gistDescription: arg.gistDescription || "Emby Keepalive Data",
    gistFilename: arg.gistFilename || "emby_keepalive_data.json"
};

// ========== 本地配置（写死，不再读取持久化）==========
const DEFAULT_CONFIG_TEXT = 
`# Emby保号配置格式: 服名|线路关键词1,关键词2|天数
桃子|embymv.link,peach|13
麻衣|miraiemby,mirai|20
飞跃彩虹|feiyue.lol,fych|55
SNTP Media Lite|cn2gias,sntp|28
Lunaris Vault|lunarisvault|85`;

const STOP_SIGNS = ["Stopped", "Playing/Stop", "ReportPlaybackStopped", "Playback/Stop"];

// ========== 工具函数 ==========
const parseConfig = (str) => {
    const servers = {};
    if (!str) return servers;
    str.trim().split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split('|');
        if (parts.length >= 2) {
            const name = parts[0].trim();
            const patterns = parts[1].split(',').map(p => p.trim()).filter(Boolean);
            const days = parts[2] ? parseInt(parts[2].trim()) : 25;
            if (name && patterns.length > 0) servers[name] = { patterns, days };
        }
    });
    return servers;
};

const getDateStr = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

// ========== Gist API 封装 ==========
const readHeartbeatFromCloud = (callback) => {
    $httpClient.get({
        url: `${GIST.baseUrl}/gists`,
        headers: {
            "Authorization": `token ${GIST.ownerToken}`,
            "Accept": "application/json"
        }
    }, (err, resp, listData) => {
        if (err || !listData) {
            console.log("[Emby保号] ⚠️ 读取 Gist 列表失败，使用空数据");
            callback({});
            return;
        }
        
        let gists;
        try {
            gists = JSON.parse(listData);
        } catch (e) {
            console.log("[Emby保号] ⚠️ 解析 Gist 列表失败，使用空数据");
            callback({});
            return;
        }
        
        const targetGist = gists.find(g => g.description === GIST.gistDescription);
        if (!targetGist) {
            console.log("[Emby保号] ℹ️ 云端无历史数据，将创建新 Gist");
            callback({});
            return;
        }
        
        $httpClient.get({
            url: `${GIST.baseUrl}/gists/${targetGist.id}`,
            headers: {
                "Authorization": `token ${GIST.ownerToken}`,
                "Accept": "application/json"
            }
        }, (err2, resp2, detailData) => {
            if (err2 || !detailData) {
                console.log("[Emby保号] ⚠️ 读取 Gist 详情失败，使用空数据");
                callback({});
                return;
            }
            
            try {
                const gist = JSON.parse(detailData);
                const filename = Object.keys(gist.files)[0];
                const content = gist.files[filename].content;
                const data = JSON.parse(content);
                console.log("[Emby保号] ✅ 已从云端读取心跳数据");
                callback(data, targetGist.id);
            } catch (e) {
                console.log("[Emby保号] ⚠️ 解析云端数据失败，使用空数据");
                callback({});
            }
        });
    });
};

const writeHeartbeatToCloud = (data, existingGistId, callback) => {
    const body = JSON.stringify({
        description: GIST.gistDescription,
        public: false,
        files: {
            [GIST.gistFilename]: {
                content: JSON.stringify(data, null, 2)
            }
        }
    });
    
    const method = existingGistId ? "patch" : "post";
    const url = existingGistId 
        ? `${GIST.baseUrl}/gists/${existingGistId}`
        : `${GIST.baseUrl}/gists`;
    
    $httpClient[method]({
        url: url,
        headers: {
            "Authorization": `token ${GIST.ownerToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: body
    }, (err, resp, responseData) => {
        if (err) {
            console.log(`[Emby保号] ❌ 云端写入失败: ${err}`);
            $notification.post("Emby 保号", "❌ 上传失败", `无法同步到 Gist\n${err}`);
            if (callback) callback(false);
            return;
        }
        
        try {
            const result = JSON.parse(responseData);
            console.log(`[Emby保号] ✅ 云端${existingGistId ? '更新' : '创建'}成功: ${result.id}`);
            if (callback) callback(true, result.id);
        } catch (e) {
            console.log("[Emby保号] ⚠️ 云端响应解析失败");
            $notification.post("Emby 保号", "⚠️ 上传异常", "Gist 响应解析失败");
            if (callback) callback(false);
        }
    });
};

// ========== 主逻辑 ==========
// 使用 IIFE 包裹，避免顶层 return 问题
(() => {
    // 检查必要参数
    if (!GIST.baseUrl || !GIST.ownerToken) {
        console.log("[Emby保号] ❌ 缺少 Gist 配置，请检查 $argument");
        console.log("[Emby保号] 需要: GistUrl=xxx&ownerToken=xxx");
        $notification.post("Emby 保号", "❌ 配置错误", "缺少 Gist 参数\n请检查 $argument");
        return $done({});
    }

    const url = $request.url || "";
    const host = $request.headers?.Host || url.match(/https?:\/\/([^\/]+)/)?.[1] || "";
    
    const isStop = STOP_SIGNS.some(sign => url.includes(sign));
    if (!isStop) return $done({});
    
    const servers = parseConfig(DEFAULT_CONFIG_TEXT);
    const serverNames = Object.keys(servers);
    if (serverNames.length === 0) {
        console.log("[Emby保号] 配置为空");
        return $done({});
    }
    
    let mightMatch = false;
    for (const s of Object.values(servers)) {
        if (s.patterns.some(p => url.includes(p) || host.includes(p))) {
            mightMatch = true;
            break;
        }
    }
    if (!mightMatch) {
        console.log(`[Emby保号] 跳过: ${url} 不在配置中`);
        return $done({});
    }
    
    readHeartbeatFromCloud((data, existingGistId) => {
        const dateStr = getDateStr();
        let matched = false;
        
        for (const [name, cfg] of Object.entries(servers)) {
            const hit = cfg.patterns.some(p => url.includes(p) || host.includes(p));
            if (hit) {
                if (!data[name]) {
                    data[name] = { lastBeat: dateStr, days: cfg.days };
                    console.log(`[Emby保号] 新服初始化: ${name}, days=${cfg.days}`);
                } else {
                    data[name].lastBeat = dateStr;
                }
                matched = true;
                console.log(`[Emby保号] ✅ ${name} → ${dateStr}`);
                break;
            }
        }
        
        if (matched) {
            writeHeartbeatToCloud(data, existingGistId, (success) => {
                if (!success) console.log("[Emby保号] ⚠️ 云端写入失败");
                $done({});
            });
        } else {
            $done({});
        }
    });
})();