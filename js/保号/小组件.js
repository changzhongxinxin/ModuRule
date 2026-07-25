// Emby 保号 - Egern 小组件 (generic 类型)
// 配置方式：通过 $argument 参数传入，或 ctx.env 环境变量

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
        ownerToken: arg.Token || ctx.env?.Token || "",
        gistDescription: arg.gistDescription || ctx.env?.gistDescription || "Emby Keepalive Data",
        gistFilename: arg.gistFilename || ctx.env?.gistFilename || "emby_keepalive_data.json"
    };

    if (!GIST.ownerToken) {
        return makeErrorWidget("配置错误", "缺少 Token 参数");
    }

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

    // 自适应颜色：浅色/深色模式自动切换
    const C = {
        bg: { light: "#FFFFFF", dark: "#0F0F12" },
        cardAlert: { light: "#FEE2E2", dark: "#2A1515" },
        cardNormal: { light: "#E8F5E9", dark: "#15201A" },
        cardOrange: { light: "#FFF3E0", dark: "#2A1F10" },
        cardLightGreen: { light: "#E8F5E9", dark: "#15201A" },
        textPrimary: { light: "#000000", dark: "#FFFFFF" },
        textSecondary: { light: "#6C6C70", dark: "#8E8E93" },
        textTertiary: { light: "#8E8E93", dark: "#636366" },
        alert: "#FF453A",
        alertBg: "#FF453A18",
        orange: "#FF9F0A",
        orangeBg: "#FF9F0A18",
        lightGreen: "#34C759",
        lightGreenBg: "#34C75918",
        normal: "#34C759",
        normalBg: "#34C75918",
        warning: "#FF9F0A",
        borderAlert: "#FF453A30",
        borderOrange: "#FF9F0A30",
        borderLightGreen: "#34C75930",
        borderNormal: "#34C75930"
    };

    function getDayStyle(remain) {
        if (remain <= 0) return { color: C.alert, bg: C.alertBg, border: C.borderAlert, card: C.cardAlert };
        if (remain <= 3) return { color: C.orange, bg: C.orangeBg, border: C.borderOrange, card: C.cardOrange };
        if (remain <= 7) return { color: C.lightGreen, bg: C.lightGreenBg, border: C.borderLightGreen, card: C.cardLightGreen };
        return { color: C.normal, bg: C.normalBg, border: C.borderNormal, card: C.cardNormal };
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
        const days = item.days || 25;
        const ds = getDayStyle(remain);
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
            backgroundColor: ds.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: ds.border,
            padding: [2, 10, 2, 10],
            children: [firstRow, secondRow]
        };
    }

    function makeNormalWidget(alerts, normal, totalCount) {
        const alertCount = alerts.length;
        const normalCount = normal.length;
        const hasAlert = alertCount > 0;

        const isSmall = ctx.widgetFamily === "systemSmall" || ctx.widgetFamily === "accessoryCircular";
        const isLock = ctx.widgetFamily?.startsWith("accessory");

        const children = [];

        const titleIcon = hasAlert ? "sf-symbol:exclamationmark.triangle.fill" : "sf-symbol:checkmark.shield.fill";
        const titleColor = hasAlert ? C.alert : C.normal;

        children.push({
            type: "stack",
            direction: "row",
            alignItems: "center",
            gap: 8,
            children: [
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
                { type: "spacer" },
                {
                    type: "text",
                    text: `${totalCount} 台`,
                    font: { size: "caption2", weight: "medium" },
                    textColor: C.textTertiary
                }
            ]
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
                    textColor: C.normal
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

    try {
        const data = await readHeartbeatFromCloud();

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
            const days = info?.days || 25;
            const lastStr = info?.lastBeat;

            if (!lastStr) {
                alerts.push({
                    name,
                    diffDays: "从未",
                    days,
                    lastStr: "从未触发"
                });
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

        return makeNormalWidget(alerts, normal, servers.length);

    } catch (err) {
        return makeErrorWidget("云端获取失败", err.message || "未知错误");
    }
}
