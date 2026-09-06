/******************************
NewAPI 通用签到 - 定时执行脚本
适配新版 new-api 鉴权：
  1. 访问令牌 PAT（个人设置生成，长期有效）
  2. /api/user/auth/refresh 的 new_api_refresh Cookie（约30天，
     每次刷新会轮换，脚本会自动回存新 Cookie）
  3. 旧版站点 Cookie + new-api-user
更新时间：2026-09-06
作者：Linsar
*******************************/

// ============================================
// 工具函数
// ============================================
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function parseArgs(str) {
  const out = {};
  if (!str) return out;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" ? parsed : {};
  } catch (_) {
    for (const part of String(str).trim().split(/&|,/)) {
      const seg = part.trim();
      if (!seg) continue;
      const idx = seg.indexOf("=");
      if (idx === -1) {
        out[decodeURIComponent(seg)] = "";
      } else {
        out[decodeURIComponent(seg.slice(0, idx))] = decodeURIComponent(seg.slice(idx + 1));
      }
    }
    return out;
  }
}

function headerKeyForHost(h) {
  return `UniversalCheckin_Headers:${h}`;
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

function originFromHost(host) {
  return `https://${host}`;
}

function isJwtToken(str) {
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(str || "").trim());
}

function readStore(key) {
  if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
  if (typeof $memory !== "undefined") return $memory.read(key);
  if (typeof $data !== "undefined") return $data.read(key);
  return null;
}

function writeStore(key, value) {
  if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
  if (typeof $memory !== "undefined") return $memory.write(value, key);
  if (typeof $data !== "undefined") return $data.write(value, key);
  return false;
}

// new-api 每次刷新会轮换 new_api_refresh，只替换该键，保留同串里的 WAF Cookie
function replaceRefreshCookie(cookieStr, newValue) {
  const parts = String(cookieStr).split(";").map(s => s.trim()).filter(Boolean);
  let replaced = false;
  const out = parts.map(p => {
    if (p.indexOf("new_api_refresh=") === 0) {
      replaced = true;
      return `new_api_refresh=${newValue}`;
    }
    return p;
  });
  if (!replaced) out.push(`new_api_refresh=${newValue}`);
  return out.join("; ");
}

function getSetCookie(resp) {
  const h = (resp && resp.headers) || {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === "set-cookie") {
      const v = h[k];
      return Array.isArray(v) ? v.join(", ") : String(v);
    }
  }
  return "";
}

// new-api 额度默认 500000 = $1
function formatQuota(q) {
  const n = Number(q);
  if (!isFinite(n) || n === 0) return q === undefined || q === null ? "" : String(q);
  return `${q}（≈$${(n / 500000).toFixed(2)}）`;
}

// Surge/Egern 脚本响应可能不解压 zstd，请求头里去掉它避免拿到解不开的响应体
function safeAcceptEncoding(value) {
  const cleaned = String(value || "").replace(/,?\s*zstd/gi, "").replace(/^,|,$/g, "").trim();
  return cleaned || "gzip, deflate, br";
}

// ============================================
// 获取保存的站点列表
// ============================================
function getSavedHosts() {
  try {
    const raw = readStore("UniversalCheckin_HostsList");
    if (!raw) return [];
    const hosts = safeJsonParse(raw) || [];
    return Array.isArray(hosts) ? hosts.filter(h => h && typeof h === "string") : [];
  } catch (e) {
    console.log("[NewAPI] 获取站点列表失败:", e);
    return [];
  }
}

// ============================================
// 新版：用 refresh Cookie 换取短期 access token
// ============================================
function refreshSession(host, saved) {
  return new Promise((resolve) => {
    const url = `${originFromHost(host)}/api/user/auth/refresh`;
    const headers = {
      "Accept": "application/json, text/plain, */*",
      "User-Agent": saved["User-Agent"] || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      "Origin": saved.Origin || originFromHost(host),
      "Referer": saved.Referer || `${originFromHost(host)}/`,
      "Accept-Encoding": safeAcceptEncoding(saved["Accept-Encoding"]),
      "Cookie": saved.Cookie || ""
    };

    const startTime = new Date().getTime();
    $httpClient.post({ url, headers, body: "" }, (err, resp, body) => {
      const latency = new Date().getTime() - startTime;
      if (err) {
        resolve({ ok: false, msg: `网络错误: ${err}` });
        return;
      }
      const status = (resp && resp.status) || 0;
      const obj = safeJsonParse(body || "") || {};
      const token = obj && obj.data && obj.data.access_token;
      console.log(`[NewAPI] 刷新会话 | HTTP ${status} | ${latency}ms`);

      if (status === 200 && obj.success && token) {
        // 轮换后的新 Cookie 必须回存，否则旧 Cookie 下次即失效
        let newCookie = "";
        const m = getSetCookie(resp).match(/new_api_refresh=([^;\s,]+)/);
        if (m && m[1]) {
          newCookie = replaceRefreshCookie(saved.Cookie || "", m[1]);
        } else {
          console.log("[NewAPI] 刷新会话 | 响应中未找到轮换的新 Cookie，沿用旧值");
        }
        resolve({ ok: true, token, newCookie });
        return;
      }

      if (status === 401 || status === 403) {
        resolve({ ok: false, expired: true, msg: `HTTP ${status}，登录会话已失效（约30天有效期）` });
        return;
      }
      resolve({ ok: false, msg: `HTTP ${status} ${obj.message || body || "未知响应"}`.trim() });
    });
  });
}

// ============================================
// 单站点签到
// ============================================
async function doCheckin(host) {
  const title = notifyTitleForHost(host);
  const key = headerKeyForHost(host);
  const raw = readStore(key);

  if (!raw) {
    $notification.post(title, "❌ 缺少参数", "请在站点 个人设置→访问令牌 点击生成（脚本自动抓取），或打开站点页面抓取 /api/user/auth/refresh 请求");
    return { success: false, host, msg: "缺少参数" };
  }

  const saved = safeJsonParse(raw);
  if (!saved) {
    $notification.post(title, "❌ 参数异常", "已保存的请求头解析失败，请重新抓包");
    return { success: false, host, msg: "参数异常" };
  }

  const auth = String(saved.Authorization || "").trim();
  const cookieStr = String(saved.Cookie || "");

  let mode;
  if (auth) {
    mode = isJwtToken(auth) ? "invalid" : "pat";
  } else if (/new_api_refresh=[^;\s,]+/.test(cookieStr)) {
    mode = "refresh";
  } else if (cookieStr && saved["new-api-user"]) {
    mode = "legacy";
  } else {
    mode = "none";
  }

  if (mode === "invalid") {
    $notification.post(title, "❌ 凭据不可用", "保存的是短期令牌（15分钟过期），请重新抓包 refresh 请求，或在站点生成访问令牌");
    return { success: false, host, msg: "凭据不可用" };
  }
  if (mode === "none") {
    $notification.post(title, "❌ 缺少参数", "已保存的参数不含可用凭据，请重新抓包");
    return { success: false, host, msg: "缺少参数" };
  }

  const baseHeaders = {
    "Host": saved.Host || host,
    "User-Agent": saved["User-Agent"] || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": saved["Accept-Language"] || "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": safeAcceptEncoding(saved["Accept-Encoding"]),
    "Origin": saved.Origin || originFromHost(host),
    "Referer": saved.Referer || `${originFromHost(host)}/profile`
  };

  let authHeader = "";
  if (mode === "pat") {
    authHeader = /^bearer /i.test(auth) ? auth : `Bearer ${auth}`;
  } else if (mode === "refresh") {
    const r = await refreshSession(host, saved);
    if (!r.ok) {
      const msg = r.expired
        ? `${r.msg}\n请重新登录站点并重新抓包，或在 个人设置→访问令牌 生成后手动填入`
        : r.msg;
      console.log(`[NewAPI] ${title} | ❌ 刷新会话失败 | ${r.msg}`);
      $notification.post(title, r.expired ? "❌ 登录会话过期" : "❌ 刷新会话失败", msg);
      return { success: false, host, msg: r.expired ? "登录会话过期" : "刷新会话失败" };
    }
    if (r.newCookie && r.newCookie !== cookieStr) {
      writeStore(key, JSON.stringify({ ...saved, Cookie: r.newCookie }));
      console.log(`[NewAPI] ${title} | 已回存轮换后的新登录会话`);
    }
    authHeader = `Bearer ${r.token}`;
  }

  const headers = { ...baseHeaders };
  if (authHeader) headers.Authorization = authHeader;
  if (mode === "legacy") {
    headers.Cookie = cookieStr;
    headers["new-api-user"] = saved["new-api-user"] || "";
  }

  return new Promise((resolve) => {
    const url = `${originFromHost(host)}/api/user/checkin`;
    const startTime = new Date().getTime();
    $httpClient.post({ url, headers, body: "" }, (err, resp, body) => {
      const latency = new Date().getTime() - startTime;

      if (err) {
        console.log(`[NewAPI] ${title} | ❌ 网络错误 | ${err}`);
        $notification.post(title, "❌ 网络错误", String(err));
        resolve({ success: false, host, msg: `网络错误: ${err}` });
        return;
      }

      const status = (resp && resp.status) || 0;
      const bodyStr = body || "";
      console.log(`[NewAPI] ${title} | HTTP ${status} | ${latency}ms | ${mode}`);

      const obj = safeJsonParse(bodyStr) || {};
      const success = Boolean(obj.success);
      const message = obj.message ? String(obj.message) : "";

      // 登录失效
      if (status === 401 || status === 403) {
        const tip = mode === "pat"
          ? "访问令牌无效，请在站点 个人设置→访问令牌 重新生成后手动填入"
          : mode === "refresh"
            ? "请重新登录站点并重新抓包，或改用访问令牌"
            : "请重新抓包保存 Cookie";
        console.log(`[NewAPI] ${title} | ❌ 登录失效 | HTTP ${status}`);
        $notification.post(title, "❌ 登录失效", `HTTP ${status}，${tip}`);
        resolve({ success: false, host, msg: "登录失效" });
        return;
      }

      // 签到成功
      if (success) {
        const checkinDate = obj?.data?.checkin_date ? String(obj.data.checkin_date) : "";
        const quotaAwarded = obj?.data?.quota_awarded !== undefined ? formatQuota(obj.data.quota_awarded) : "";
        const content = `${checkinDate ? `日期：${checkinDate}\n` : ""}${quotaAwarded ? `获得：${quotaAwarded}` : "签到成功"}`;
        console.log(`[NewAPI] ${title} | ✅ 签到成功 | ${content.replace(/\n/g, " | ")}`);
        $notification.post(title, "✅ 签到成功", content);
        resolve({ success: true, host, msg: "签到成功", data: { date: checkinDate, quota: quotaAwarded } });
        return;
      }

      // 失败/已签到/其他
      console.log(`[NewAPI] ${title} | ❌ 签到失败 | ${message || bodyStr}`);
      $notification.post(title, "⚠️ 签到结果", message || "未知响应");
      resolve({ success: false, host, msg: message || "签到失败" });
    });
  });
}

// ============================================
// 主入口
// ============================================
const args = parseArgs(typeof $argument !== "undefined" ? $argument : "");
const onlyHost = (args.host || "").trim();
const hostsToRun = onlyHost ? [onlyHost] : getSavedHosts();

if (!onlyHost && hostsToRun.length === 0) {
  $notification.post("NewAPI 通用签到", "❌ 无可用站点", "请在站点 个人设置→访问令牌 点击生成（脚本自动抓取），或打开站点页面抓取 /api/user/auth/refresh 请求");
  $done();
} else {
  (async () => {
    console.log(`[NewAPI] 开始签到，共 ${hostsToRun.length} 个站点`);

    for (const h of hostsToRun) {
      await doCheckin(h);
    }

    console.log("[NewAPI] 全部签到完成");
    $done();
  })();
}