/******************************
NewAPI 通用签到 - Egern 原生脚本
更新时间：2026-09-06

使用方法：
1. 在站点 个人中心 → 安全 → 访问令牌 生成令牌（只显示一次，复制保存）
2. 在 Egern 脚本设置中添加两个环境变量：
   host  = api.afsmc.cn
   token = 粘贴令牌
   多站点时用英文逗号列出，按顺序一一对应：
   host = api.afsmc.cn,other.com
   token = 令牌1,令牌2
3. 手动运行一次本脚本测试；之后按 cron 定时自动签到

注意：这里要填的是"访问令牌"（个人中心生成的随机串，长期有效），
不是网页登录产生的短期 JWT（15 分钟即过期，脚本检测到会提示）。
令牌可能包含 / + = 等 base64 字符，属正常现象，脚本会原样发送。
*******************************/

const QUOTA_PER_UNIT = 500000; // new-api 额度默认 500000 = $1

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function notifyTitleForHost(host) {
  try {
    let name = host.replace(/^www\./, "").split(".")[0];
    name = name.replace(/[-_]api$/i, "").replace(/[-_]service$/i, "").replace(/^api[-_]/i, "");
    return name.charAt(0).toUpperCase() + name.slice(1) || host;
  } catch (_) { return host; }
}

// 网页登录产生的短期 access token 是 JWT；个人中心生成的访问令牌是普通随机串
function isJwtToken(str) {
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(str || "").trim());
}

function formatQuota(q) {
  const n = Number(q);
  if (!isFinite(n) || n === 0) return q === undefined || q === null ? "" : String(q);
  return `${q}（≈$${(n / QUOTA_PER_UNIT).toFixed(2)}）`;
}

// 只能用于域名！令牌是 base64 系字符，可能含 /，绝不能走这个函数
function normalizeHost(h) {
  return String(h || "").trim().replace(/^https?:\/\//i, "").split("/")[0].trim();
}

function splitList(str) {
  return String(str || "").split(",").map(s => s.trim()).filter(Boolean);
}

async function checkin(ctx, host, token) {
  const title = notifyTitleForHost(host);

  if (token.indexOf("在这里填入") !== -1 || token.indexOf("粘贴") !== -1) {
    ctx.notify({ title, subtitle: "❌ 尚未配置令牌", body: "请把环境变量 token 的值替换为你的访问令牌（个人中心 → 安全 → 访问令牌 生成）" });
    return;
  }
  if (isJwtToken(token)) {
    ctx.notify({ title, subtitle: "❌ 令牌类型不对", body: "填入的是网页登录的短期令牌（15分钟过期）。请到 个人中心 → 安全 → 访问令牌 生成随机串令牌" });
    return;
  }

  const sentToken = token.replace(/^Bearer\s+/i, "");

  try {
    const resp = await ctx.http.post(`https://${host}/api/user/checkin`, {
      headers: {
        "Host": host,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Origin": `https://${host}`,
        "Referer": `https://${host}/profile`,
        "Authorization": `Bearer ${sentToken}`
      },
      body: "",
      timeout: 30000
    });

    const status = resp.status;
    const bodyStr = await resp.text();
    const obj = safeJsonParse(bodyStr) || {};
    const success = Boolean(obj.success);
    const message = obj.message ? String(obj.message) : "";
    const code = obj.code ? String(obj.code) : "";

    // 令牌无效：带令牌指纹和响应片段，便于定位是令牌填错还是被 WAF 拦截
    if (status === 401 || status === 403) {
      const fp = `长度${sentToken.length}，${sentToken.slice(0, 4)}…${sentToken.slice(-4)}`;
      const preview = bodyStr.replace(/\s+/g, " ").trim().slice(0, 150);
      ctx.notify({ title, subtitle: `❌ 令牌无效（HTTP ${status}）`, body: `令牌指纹：${fp}\n响应片段：${preview || "(空)"}` });
      return;
    }

    // 签到成功
    if (success) {
      const checkinDate = obj?.data?.checkin_date ? String(obj.data.checkin_date) : "";
      const quotaAwarded = obj?.data?.quota_awarded !== undefined ? formatQuota(obj.data.quota_awarded) : "";
      const runAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      const content = `运行时间：${runAt}\n${checkinDate ? `日期：${checkinDate}\n` : ""}${quotaAwarded ? `获得：${quotaAwarded}` : "签到成功"}`;
      ctx.notify({ title, subtitle: "✅ 签到成功", body: content });
      return;
    }

    // 已签到 / 功能未启用 / 其他失败
    const runAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    ctx.notify({ title, subtitle: "⚠️ 签到结果", body: `${message || "未知响应"}（运行时间：${runAt}）` });
  } catch (e) {
    ctx.notify({ title, subtitle: "❌ 网络错误", body: String(e && e.message ? e.message : e) });
  }
}

export default async function(ctx) {
  const hosts = splitList(ctx.env && ctx.env.host).map(normalizeHost);
  const tokens = splitList(ctx.env && ctx.env.token);

  if (hosts.length === 0 || tokens.length === 0) {
    ctx.notify({
      title: "NewAPI 通用签到",
      subtitle: "❌ 未配置令牌",
      body: "请给脚本添加环境变量 host 和 token。令牌在站点 个人中心 → 安全 → 访问令牌 生成"
    });
    return;
  }

  for (let i = 0; i < hosts.length; i++) {
    if (!tokens[i]) continue;
    await checkin(ctx, hosts[i], tokens[i]);
  }
}