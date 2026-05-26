/**
 * Emby 保号 - Stop 触发器
 * 存储格式: { "服名": {"lastBeat": "2026-05-27", "days": 25} }
 * 只认配置过的服，未匹配的直接跳过不读写持久化
 */

const STORE_KEY = "emby_keepalive_data";

// ===== 配置区：只改这里 =====
const SERVER_PATTERNS = {
    "桃子": ["embymv.link", "peach"],
    "麻衣": ["miraiemby", "mirai"],
    "飞跃彩虹": ["feiyue.lol","fych"]
};

const DEFAULT_DAYS = {
    "桃子": 13,
    "麻衣": 22,
    "飞跃彩虹": 55
};

// Stop 请求关键词（URL 包含任一即视为停止播放）
const STOP_SIGNS = ["Stopped", "Playing/Stop", "ReportPlaybackStopped", "Playback/Stop"];
// =============================

(() => {
    const url = $request.url || "";
    const host = $request.headers?.Host || url.match(/https?:\/\/([^\/]+)/)?.[1] || "";
    
    // 1. 先判断是不是 Stop 类请求（Surge Pattern 已过滤，这里二次保险）
    const isStop = STOP_SIGNS.some(sign => url.includes(sign));
    if (!isStop) return $done({});
    
    // 2. 快速退出：URL/Host 是否可能命中任何已配置的服？
    const allPatterns = Object.values(SERVER_PATTERNS).flat();
    const mightMatch = allPatterns.some(p => url.includes(p) || host.includes(p));
    if (!mightMatch) {
        console.log(`[Emby保号] 跳过: ${host} 不在配置中`);
        return $done({});
    }
    
    // 3. 【关键】读取原始存储，避免覆盖其他服数据
    let data = {};
    const stored = $persistentStore.read(STORE_KEY);
    if (stored) {
        try { data = JSON.parse(stored); } catch(e) {}
    }
    
    // 4. 生成今天日期 YYYY-MM-DD
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    let matched = false;
    
    // 5. 遍历匹配：命中哪个服就更新哪个服，其他服数据完全不动
    for (const [name, patterns] of Object.entries(SERVER_PATTERNS)) {
        const hit = patterns.some(p => url.includes(p) || host.includes(p));
        if (hit) {
            if (!data[name]) {
                // 新服首次触发：初始化，写入默认天数
                data[name] = {
                    lastBeat: dateStr,
                    days: DEFAULT_DAYS[name] || 25
                };
                console.log(`[Emby保号] 新服初始化: ${name}, days=${data[name].days}`);
            } else {
                // 老服：只更新日期，days 和其他服数据保持原样
                data[name].lastBeat = dateStr;
            }
            matched = true;
            console.log(`[Emby保号] ✅ ${name} → ${dateStr}`);
            break; // 匹配到即停，防止一个请求命中多个服
        }
    }
    
    // 6. 只有真正匹配到才写回持久化
    if (matched) {
        const ok = $persistentStore.write(JSON.stringify(data, null, 2), STORE_KEY);
        if (!ok) console.log("[Emby保号] ⚠️ 写入失败");
    }
    
    $done({});
})();
