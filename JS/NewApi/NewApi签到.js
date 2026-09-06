/******************************
NewAPI 通用签到 - 定时执行脚本（令牌直填版）
更新时间：2026-09-06

使用方法：
1. 在站点 个人中心 → 安全 → 访问令牌 生成令牌（只显示一次，复制保存）
2. 按所在平台二选一配置：
   · Egern：给脚本添加两个环境变量
       host  = api.afsmc.cn
       token = 粘贴令牌
   · Surge / Loon：argument 填 host=api.afsmc.cn&token=粘贴令牌
   多站点时用英文逗号列出并按顺序一一对应：
   host=域名1,域名2 / token=令牌1,令牌2
3. 手动运行一次本脚本测试；之后每天定时自动签到

注意：这里要填的是"访问令牌"（个人中心生成的随机串，长期有效），
不是网页登录产生的短期 JWT（15 分钟即过期，脚本检测到会提示）。
*******************************/

// ============================================
// 工具函数
// ============================================
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

// ============================================
// 读取配置：Egern 环境变量优先，其次 argument（Surge/Loon）
// ============================================
function getConfig() {
  // Egern：脚本设置中的环境变量直接挂在 $env 下
  if (typeof $env !== "undefined" && $env && typeof $env === "object") {
    if ($env.host !== undefined || $env.token !== undefined) {
      return { host: String($env.host ?? ""), token: String($env.token ?? "") };
    }
    if ($env._compat && $env._compat.$argument !== undefined) {
      return parseArgs($env._compat.$argument);
    }
  }
  // Surge / Loon：argument 参数
  if (typeof $argument !== "undefined") {
    return parseArgs($argument);
  }
  return {};
}

// 支持 host=xx&token=yy 形式，也兼容 JSON
function parseArgs(str) {
  const out = {};
  if (!str) return out;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" ? parsed : {};
  } catch (_) {
    for (const part of String(str).trim().split("&")) {
      const seg = part.trim();
      if (!seg) continue;
      const idx = seg.indexOf("=");
      if (idx === -1) continue;
      out[decodeURIComponent(seg.slice(0, idx)).trim()] = decodeURIComponent(seg.slice(idx + 1)).trim();
    }
    return out;
  }
}

function splitList(str) {
  return String(str || "").split(",").map(s => s.trim()).filter(Boolean);
}

function notifyTitleForHost(host) {
  if (host === "hotaruapi.com") return "HotaruAPI";
  if (host === "kfc-api.sxxe.net") return "KFC-API";
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

// new-api 额度默认 500000 = $1
function formatQuota(q) {
  const n = Number(q);
  if (!isFinite(n) || n === 0) return q === undefined || q === null ? "" : String(q);
  return `${q}（≈$${(n / 500000).toFixed(2)}）`;
}

// ============================================
// 解析 argument：host 与 token 按逗号顺序一一对应
// ============================================
function parseTargets(args) {
  const hosts = splitList(args.host);
  const tokens = splitList(args.token);
  const out = [];
  for (let i = 0; i < hosts.length; i++) {
    if (hosts[i] && tokens[i]) out.push({ host: hosts[i], token: tokens[i] });
  }
  return out;
}

// ============================================
// 单站点签到
// ============================================
function doCheckin(host, token) {
  const title = notifyTitleForHost(host);

  if (token.indexOf("在这里填入") !== -1 || token.indexOf("粘贴") !== -1) {
    $notification.post(title, "❌ 尚未配置令牌", "请把模块 argument 中 token= 后面替换为你的访问令牌（个人中心 → 安全 → 访问令牌 生成）");
    return Promise.resolve({ host, ok: false });
  }
  if (isJwtToken(token)) {
    $notification.post(title, "❌ 令牌类型不对", "填入的是网页登录的短期令牌（15分钟过期）。请到站点 个人中心 → 安全 → 访问令牌 生成随机串令牌");
    return Promise.resolve({ host, ok: false });
  }

  const headers = {
    "Host": host,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": `https://${host}`,
    "Referer": `https://${host}/profile`,
    "Authorization": `Bearer ${token.replace(/^Bearer\s+/i, "")}`
  };

  return new Promise((resolve) => {
    const url = `https://${host}/api/user/checkin`;
    const startTime = new Date().getTime();
    $httpClient.post({ url, headers, body: "" }, (err, resp, body) => {
      const latency = new Date().getTime() - startTime;

      if (err) {
        console.log(`[NewAPI] ${title} | ❌ 网络错误 | ${err}`);
        $notification.post(title, "❌ 网络错误", String(err));
        resolve({ host, ok: false });
        return;
      }

      const status = (resp && resp.status) || 0;
      const bodyStr = body || "";
      const obj = safeJsonParse(bodyStr) || {};
      const success = Boolean(obj.success);
      const message = obj.message ? String(obj.message) : "";
      const code = obj.code ? String(obj.code) : "";
      console.log(`[NewAPI] ${title} | HTTP ${status} | ${latency}ms | ${message || code || bodyStr.slice(0, 120)}`);

      // 令牌无效
      if (status === 401 || status === 403) {
        const tip = code === "AUTH_TOKEN_EXPIRED"
          ? "令牌已过期（这是短期登录令牌）。请到 个人中心 → 安全 → 访问令牌 生成随机串令牌"
          : "访问令牌无效，请到 个人中心 → 安全 → 访问令牌 重新生成并更新模块 argument";
        $notification.post(title, `❌ 令牌无效（HTTP ${status}）`, `${code ? code + "\n" : ""}${tip}`);
        resolve({ host, ok: false });
        return;
      }

      // 签到成功
      if (success) {
        const checkinDate = obj?.data?.checkin_date ? String(obj.data.checkin_date) : "";
        const quotaAwarded = obj?.data?.quota_awarded !== undefined ? formatQuota(obj.data.quota_awarded) : "";
        const content = `${checkinDate ? `日期：${checkinDate}\n` : ""}${quotaAwarded ? `获得：${quotaAwarded}` : "签到成功"}`;
        $notification.post(title, "✅ 签到成功", content);
        resolve({ host, ok: true });
        return;
      }

      // 已签到 / 功能未启用 / 其他失败
      $notification.post(title, "⚠️ 签到结果", message || "未知响应");
      resolve({ host, ok: false });
    });
  });
}

// ============================================
// 主入口
// ============================================
const targets = parseTargets(getConfig());

if (targets.length === 0) {
  $notification.post("NewAPI 通用签到", "❌ 未配置令牌", "Egern 请给脚本添加环境变量 host 和 token；Surge/Loon 在 argument 填 host=域名&token=令牌。令牌在站点 个人中心 → 安全 → 访问令牌 生成");
  $done();
} else {
  (async () => {
    console.log(`[NewAPI] 开始签到，共 ${targets.length} 个站点`);

    for (const t of targets) {
      await doCheckin(t.host, t.token);
    }

    console.log("[NewAPI] 全部签到完成");
    $done();
  })();
}