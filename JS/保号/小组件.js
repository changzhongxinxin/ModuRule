// Emby 保号 + Chilledmelon 订阅监控 - Egern 小组件 (generic 类型)
// 配置方式：
// 1. Gist 配置：$argument 或 ctx.env 传入 Token / gistUrl / gistDescription / gistFilename
// 2. CM Token：自动读取持久化存储 $persistentStore 的 'ChilledmelonToken'，或通过 $argument / ctx.env 传入 cmToken

export default async function(ctx) {
// ========== 配置读取（$argument 优先，fallback 到 ctx.env）==========
let arg = {};
try {
    if (typeof $argument !== 'undefined' && $argument) {
        arg = Object.fromEntries(new URLSearchParams($argument));
    }
} catch (e) {}

const GIST = {
    baseUrl: arg.gistUrl || ctx.env?.gistUrl || "https://api.github.com",
    ownerToken: arg.Token || arg.token || ctx.env?.Token || ctx.env?.token || "",
    gistDescription: arg.gistDescription || ctx.env?.gistDescription || "Emby Keepalive Data",
    gistFilename: arg.gistFilename || ctx.env?.gistFilename || "emby_keepalive_data.json"
};

if (!GIST.ownerToken) {
    return makeErrorWidget("配置错误", "缺少 Token 参数");
}

// ========== 网络工具函数 ==========
async function httpGet(url, headers, retryCount = 0) {
    try {
        const resp = await ctx.http.get(url, { headers, timeout: 15000 });
        if (resp.status >= 200 && resp.status < 300) {
            return await resp.json();
        }
        throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
        if (retryCount < 1) {
            await new Promise(r => setTimeout(r, 1000));
            return httpGet(url, headers, retryCount + 1);
        }
        throw err;
    }
}

// ========== Emby Gist 数据获取 ==========
async function readHeartbeatFromCloud() {
    const gists = await httpGet(
        `${GIST.baseUrl}/gists`,
        {
            "Authorization": `token ${GIST.ownerToken}`,
            "Accept": "application/json"
        }
    );

    const targetGist = gists.find(g => g.description === GIST.gistDescription);
    if (!targetGist) {
        throw new Error("云端暂无数据，请先触发 Stop 请求");
    }

    const gist = await httpGet(
        `${GIST.baseUrl}/gists/${targetGist.id}`,
        {
            "Authorization": `token ${GIST.ownerToken}`,
            "Accept": "application/json"
        }
    );

    let filename = GIST.gistFilename;
    let fileObj = gist.files[filename];

    if (!fileObj) {
        const filenames = Object.keys(gist.files);
        if (filenames.length > 0) {
            filename = filenames[0];
            fileObj = gist.files[filename];
        }
    }

    if (!fileObj) {
        throw new Error("Gist 中没有文件");
    }

    return JSON.parse(fileObj.content);
}

// ========== Chilledmelon (Me 接口) 仅使用 Token 请求 ==========
async function fetchChilledmelonDays() {
    let token = arg.cmToken || ctx.env?.cmToken;
    if (!token && typeof $persistentStore !== 'undefined') {
        token = $persistentStore.read('ChilledmelonToken') || "";
    }

    if (!token) {
        return null;
    }

    try {
        const resp = await ctx.http.get("https://www.chilledmelon.com/api/auth/me", {
            headers: {
                'origin': 'https://www.chilledmelon.com',
                'referer': 'https://www.chilledmelon.com/',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
                'accept': 'application/json',
                'x-admin-token': token
            },
            timeout: 8000
        });

        if (resp.status === 200) {
            const json = await resp.json();
            if (json && json.expiresAt) {
                const expireTime = new Date(json.expiresAt).getTime();
                const days = (expireTime - Date.now()) / (1000 * 60 * 60 * 24);
                return days;
            }
        }
    } catch (e) {
        console.log("请求 Chilledmelon Me 接口失败: " + e);
    }

    return null;
}

// ========== 颜色样式与 UI 配置 ==========
const C = {
    bg: { light: "#FFFFFF", dark: "#0F0F12" },
    textPrimary: { light: "#000000", dark: "#FFFFFF" },
    textSecondary: { light: "#6C6C70", dark: "#8E8E93" },
    textTertiary: { light: "#8E8E93", dark: "#636366" },
    alert: "#FF453A",
    alertBg: "#FF453A18",
    orange: "#FF9F0A",
    orangeBg: "#FF9F0A18",
    lightGreen: "#34C759",
    lightGreenBg: "#34C75918",
    darkGreen: "#0A8043",
    darkGreenBg: "#0A804318",
    normal: "#34C759",
    normalBg: "#34C75918",
    warning: "#FF9F0A",
    borderAlert: "#FF453A30",
    borderOrange: "#FF9F0A30",
    borderLightGreen: "#34C75930",
    borderDarkGreen: "#0A804330",
    borderNormal: "#34C75930"
};

// 按剩余百分比返回颜色（只返回边框、点缀、badge 颜色，不再返回卡片背景）
function getDayStyle(percent) {
    if (percent <= 0) {
        return { color: C.alert, bg: C.alertBg, border: C.borderAlert };
    }
    if (percent < 30) {
        return { color: C.alert, bg: C.alertBg, border: C.borderAlert };
    }
    if (percent < 50) {
        return { color: C.orange, bg: C.orangeBg, border: C.borderOrange };
    }
    if (percent < 70) {
        return { color: C.lightGreen, bg: C.lightGreenBg, border: C.borderLightGreen };
    }
    return { color: C.darkGreen, bg: C.darkGreenBg, border: C.borderDarkGreen };
}

function formatTime(lastStr) {
    if (!lastStr || lastStr === "从未触发") return "从未";
    return lastStr;
}

function makeErrorWidget(title, message) {
    return {
        type: "widget",
        backgroundColor: C.bg,
        padding: [14, 16, 14, 16],
        gap: 8,
        children: [
            {
                type: "stack",
                direction: "row",
                alignItems: "center",
                gap: 8,
                children: [
                    {
                        type: "image",
                        src: "sf-symbol:exclamationmark.triangle.fill",
                        color: C.warning,
                        width: 20,
                        height: 20
                    },
                    {
                        type: "text",
                        text: title,
                        font: { size: "headline", weight: "semibold" },
                        textColor: C.textPrimary
                    }
                ]
            },
            {
                type: "text",
                text: message,
                font: { size: "footnote" },
                textColor: C.textSecondary,
                maxLines: 3
            }
        ]
    };
}

function makeEmptyWidget() {
    return {
        type: "widget",
        backgroundColor: C.bg,
        padding: [14, 16, 14, 16],
        gap: 10,
        children: [
            {
                type: "stack",
                direction: "row",
                alignItems: "center",
                gap: 8,
                children: [
                    {
                        type: "image",
                        src: "sf-symbol:play.circle.fill",
                        color: C.normal,
                        width: 20,
                        height: 20
                    },
                    {
                        type: "text",
                        text: "Emby 保号",
                        font: { size: "headline", weight: "semibold" },
                        textColor: C.textPrimary
                    },
                    { type: "spacer" },
                    {
                        type: "text",
                        text: "0 台",
                        font: { size: "caption1", weight: "medium" },
                        textColor: C.textTertiary
                    }
                ]
            },
            {
                type: "text",
                text: "暂无数据，请先播放视频触发 Stop 请求",
                font: { size: "footnote" },
                textColor: C.textSecondary,
                maxLines: 2
            }
        ]
    };
}

function buildServerCard(item, isAlert) {
    const remain = isAlert ? 0 : item.remain;
    const days = item.days;
    const percent = isAlert ? 0 : Math.round((remain / days) * 100);
    const ds = getDayStyle(percent);
    const timeStr = formatTime(item.lastStr);

    const nameWithDays = {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 3,
        flex: 1,
        children: [
            {
                type: "text",
                text: item.name,
                font: { size: "subheadline", weight: "semibold" },
                textColor: C.textPrimary,
                maxLines: 1
            },
            {
                type: "text",
                text: `/ ${days}天`,
                font: { size: "caption2" },
                textColor: C.textTertiary,
                maxLines: 1
            }
        ]
    };

    const firstRow = {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 5,
        children: [
            {
                type: "stack",
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: ds.color
            },
            nameWithDays,
            {
                type: "stack",
                backgroundColor: ds.bg,
                borderRadius: 5,
                padding: [2, 6, 2, 6],
                children: [
                    {
                        type: "text",
                        text: `剩 ${remain} 天`,
                        font: { size: "caption2", weight: "bold" },
                        textColor: ds.color,
                        maxLines: 1
                    }
                ]
            }
        ]
    };

    const secondRow = {
        type: "text",
        text: timeStr,
        font: { size: 9 },
        textColor: C.textTertiary,
        maxLines: 1
    };

    return {
        type: "stack",
        direction: "column",
        gap: 1,
        height: 44,
        backgroundColor: C.bg,   // <-- 和 Widget 整体背景一致
        borderRadius: 10,
        borderWidth: 3,
        borderColor: ds.border,    // <-- 边框保留颜色
        padding: [2, 10, 2, 10],
        children: [firstRow, secondRow]
    };
}

function makeNormalWidget(alerts, normal, totalCount, cmDays) {
    const alertCount = alerts.length;
    const normalCount = normal.length;
    const hasAlert = alertCount > 0;

    const isSmall = ctx.widgetFamily === "systemSmall" || ctx.widgetFamily === "accessoryCircular";
    const isLock = ctx.widgetFamily?.startsWith("accessory");

    const children = [];

    const titleIcon = hasAlert ? "sf-symbol:exclamationmark.triangle.fill" : "sf-symbol:checkmark.shield.fill";
    const titleColor = hasAlert ? C.alert : C.darkGreen;

    const headerChildren = [
        {
            type: "image",
            src: titleIcon,
            color: titleColor,
            width: isSmall ? 14 : 18,
            height: isSmall ? 14 : 18
        },
        {
            type: "text",
            text: hasAlert ? `${alertCount} 个需关注` : "全部正常",
            font: { size: isSmall ? "subheadline" : "headline", weight: "semibold" },
            textColor: C.textPrimary
        },
        { type: "spacer" }
    ];

    if (cmDays !== null && cmDays !== undefined) {
        const daysNum = Number(cmDays);
        const isWarning = daysNum < 3;
        const cmTextColor = isWarning ? C.warning : C.textTertiary;
        const cmText = daysNum <= 0 ? "瓜:已过期" : `西瓜:${daysNum.toFixed(2)}天`;

        headerChildren.push({
            type: "text",
            text: cmText,
            font: { size: "caption2", weight: "medium" },
            textColor: cmTextColor
        });
    }

    headerChildren.push({
        type: "text",
        text: `${totalCount} 台`,
        font: { size: "caption2", weight: "medium" },
        textColor: C.textTertiary
    });

    children.push({
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 8,
        children: headerChildren
    });

    if (isSmall) {
        if (hasAlert) {
            children.push({
                type: "text",
                text: `${alertCount} 个账号已超期`,
                font: { size: "footnote" },
                textColor: C.alert
            });
        }
        if (normalCount > 0) {
            children.push({
                type: "text",
                text: `${normalCount} 个账号正常`,
                font: { size: "footnote" },
                textColor: C.darkGreen
            });
        }

        return {
            type: "widget",
            backgroundColor: C.bg,
            padding: [12, 14, 12, 14],
            gap: 6,
            children: children
        };
    }

    const allCards = [];

    for (const alert of alerts) {
        allCards.push(buildServerCard(alert, true));
    }

    for (const n of normal) {
        allCards.push(buildServerCard(n, false));
    }

    const rows = [];
    for (let i = 0; i < allCards.length; i += 2) {
        const rowChildren = [allCards[i]];
        if (allCards[i + 1]) {
            rowChildren.push(allCards[i + 1]);
        } else {
            rowChildren.push({ type: "spacer", flex: 1 });
        }

        rows.push({
            type: "stack",
            direction: "row",
            gap: 8,
            children: rowChildren.map(c => ({ ...c, flex: 1 }))
        });
    }

    children.push({
        type: "stack",
        direction: "column",
        gap: 8,
        children: rows
    });

    return {
        type: "widget",
        backgroundColor: C.bg,
        padding: isLock ? [10, 12, 10, 12] : [14, 16, 14, 16],
        gap: isLock ? 6 : 10,
        children: children
    };
}

// ========== 执行入口 ==========
try {
    const [gistResult, cmResult] = await Promise.allSettled([
        readHeartbeatFromCloud(),
        fetchChilledmelonDays()
    ]);

    if (gistResult.status === "rejected") {
        throw gistResult.reason;
    }

    const data = gistResult.value;
    const cmDays = cmResult.status === "fulfilled" ? cmResult.value : null;

    if (!data || Object.keys(data).length === 0) {
        return makeEmptyWidget();
    }

    const servers = Object.keys(data);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const alerts = [];
    const normal = [];

    for (const name of servers) {
        const info = data[name];
        const days = info.days;
        const lastStr = info?.lastBeat;

        // 心跳缺失按"从未触发"处理，避免 split 抛错导致整个组件渲染失败
        if (!lastStr) {
            alerts.push({ name, diffDays: 9999, days, lastStr });
            continue;
        }

        const datePart = lastStr.split(" ")[0];
        const [y, m, d] = datePart.split("-").map(Number);
        const lastDate = new Date(y, m - 1, d);
        const diffDays = Math.floor((today - lastDate) / 86400000);

        if (diffDays > days) {
            alerts.push({ name, diffDays, days, lastStr });
        } else {
            const remain = days - diffDays;
            normal.push({ name, remain, lastStr, days });
        }
    }

    // ========== 新增：最多显示剩余天数最少的 4 个 ==========
    const allItems = [
        ...alerts.map(a => ({ ...a, remain: -a.diffDays })),
        ...normal
    ];
    allItems.sort((a, b) => a.remain - b.remain);
    const top4 = allItems.slice(0, 4);

    const finalAlerts = top4
        .filter(item => item.remain <= 0)
        .map(({ remain, ...rest }) => rest);
    const finalNormal = top4.filter(item => item.remain > 0);
    // ================================================

    return makeNormalWidget(finalAlerts, finalNormal, servers.length, cmDays);

} catch (err) {
    return makeErrorWidget("云端获取失败", err.message || "未知错误");
}

}