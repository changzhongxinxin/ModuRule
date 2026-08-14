/**
 * Emby 保号 - 定时巡检
 * 完全从持久化 emby_keepalive_data 读取，脚本内无任何硬编码配置
 */

const STORE_KEY = "Emby_keepalive_Data";

(() => {
    const stored = $persistentStore.read(STORE_KEY);
    if (!stored) {
        $notification.post("Emby 保号", "暂无数据", "请先播放视频触发 Stop 请求");
        return $done();
    }
    
    let data = {};
    try { 
        data = JSON.parse(stored); 
    } catch(e) {
        $notification.post("Emby 保号", "数据损坏", "请清除持久化存储后重试");
        return $done();
    }
    
    const servers = Object.keys(data);
    if (servers.length === 0) {
        $notification.post("Emby 保号", "无账号", "请先触发 Stop 请求初始化");
        return $done();
    }
    
    // 今天 0 点（消除时分秒影响，只算整天差）
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
        
        // 计算天数差：只取日期部分，忽略时间
        const datePart = lastStr.split(' ')[0];
        const [y, m, d] = datePart.split('-').map(Number);
        const lastDate = new Date(y, m - 1, d);
        const diffDays = Math.floor((today - lastDate) / 86400000);
        
        if (diffDays > days) {
            alerts.push(`🚨 ${name}\n   已 ${diffDays} 天未活跃（限 ${days} 天）\n   最后: ${lastStr}`);
        } else {
            const remain = days - diffDays;
            normal.push(`✅ ${name}: 剩 ${remain} 天 (最后${lastStr})`);
        }
    }
    
    if (alerts.length > 0) {
        $notification.post(
            "🚨 Emby 保号提醒",
            `${alerts.length} 个账号需关注`,
            alerts.join("\n\n") + (normal.length ? "\n\n———\n" + normal.join("\n") : "")
        );
    } else {
        console.log("[Emby保号巡检] 全部正常\n" + normal.join("\n"));
    }
    
    $done();
})();
