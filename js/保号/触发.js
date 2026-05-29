/**
 * Emby 保号 - Stop 触发器
 * 配置源: 持久化 emby_keepalive_config (纯文本)
 * 心跳存储: 持久化 emby_keepalive_data (JSON, 带缩进)
 */

const CONFIG_KEY = "emby_keepalive_config";
const HEARTBEAT_KEY = "emby_keepalive_data";

const STOP_SIGNS = ["Stopped", "Playing/Stop", "ReportPlaybackStopped", "Playback/Stop"];

// 首次运行默认配置（自动写入持久化，方便后续在Surge里直接编辑）
const DEFAULT_CONFIG_TEXT = 
`# Emby保号配置格式: 服名|线路关键词1,关键词2|天数
桃子|embymv.link,peach|13
麻衣|miraiemby,mirai|20
飞跃彩虹|feiyue.lol,fych|55
Lunaris Vault|lunarisvault.com|80`;

// 解析配置文本
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

(() => {
    const url = $request.url || "";
    const host = $request.headers?.Host || url.match(/https?:\/\/([^\/]+)/)?.[1] || "";
    
    // 1. 过滤 Stop 请求
    const isStop = STOP_SIGNS.some(sign => url.includes(sign));
    if (!isStop) return $done({});
    
    // 2. 读取配置（纯文本）
    let configText = $persistentStore.read(CONFIG_KEY);
    if (!configText) {
        $persistentStore.write(DEFAULT_CONFIG_TEXT, CONFIG_KEY);
        configText = DEFAULT_CONFIG_TEXT;
        console.log("[Emby保号] 首次运行，已写入默认配置到 emby_keepalive_config");
    }
    
    const servers = parseConfig(configText);
    const serverNames = Object.keys(servers);
    if (serverNames.length === 0) {
        console.log("[Emby保号] 配置为空");
        return $done({});
    }
    
    // 3. 快速退出：URL 是否命中任何已配置线路？
    let mightMatch = false;
    for (const s of Object.values(servers)) {
        if (s.patterns.some(p => url.includes(p) || host.includes(p))) {
            mightMatch = true;
            break;
        }
    }
    if (!mightMatch) {
        console.log(`[Emby保号] 跳过: ${host} 不在配置中`);
        return $done({});
    }
    
    // 4. 【关键】读取原始心跳数据，避免覆盖其他服
    let data = {};
    const stored = $persistentStore.read(HEARTBEAT_KEY);
    if (stored) {
        try { data = JSON.parse(stored); } catch(e) {}
    }
    
    // 5. 生成日期时间 YYYY-MM-DD HH:mm:ss
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    let matched = false;
    
    // 6. 匹配并更新（只改目标服，其他服不动）
    for (const [name, cfg] of Object.entries(servers)) {
        const hit = cfg.patterns.some(p => url.includes(p) || host.includes(p));
        if (hit) {
            if (!data[name]) {
                // 新服：从配置里取 days 初始化
                data[name] = {
                    lastBeat: dateStr,
                    days: cfg.days
                };
                console.log(`[Emby保号] 新服初始化: ${name}, days=${cfg.days}`);
            } else {
                // 老服：只更新日期时间，days 保持已有值
                data[name].lastBeat = dateStr;
            }
            matched = true;
            console.log(`[Emby保号] ✅ ${name} → ${dateStr}`);
            break;
        }
    }
    
    // 7. 写回心跳 JSON（带缩进）
    if (matched) {
        const ok = $persistentStore.write(JSON.stringify(data, null, 2), HEARTBEAT_KEY);
        if (!ok) console.log("[Emby保号] ⚠️ 心跳写入失败");
    }
    
    $done({});
})();
