/******************************
NewAPI 通用签到 - Header抓取脚本
适配新版 new-api JWT 鉴权（access token 仅15分钟有效，长期凭据为
/api/user/auth/refresh 请求中的 new_api_refresh Cookie，约30天有效）
更新时间：2026-09-06
作者：Linsar

新版站点：打开站点页面触发 /api/user/auth/refresh 请求即可抓取
旧版站点：仍支持抓取 /api/user/self 的 Cookie + new-api-user
*******************************/

const HEADER_KEY_PREFIX = "UniversalCheckin_Headers";
const HOSTS_LIST_KEY = "UniversalCheckin_HostsList";

const NEED_KEYS = [
  "Host", "User-Agent", "Accept", "Accept-Language",
  "Accept-Encoding", "Origin", "Referer", "Cookie", "new-api-user", "Authorization"
];

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function getArgument() {
  if (typeof $argument !== "undefined") return $argument;
  if (typeof $env !== "undefined" && $env._compat && $env._compat.$argument !== undefined) {
    return $env._compat.$argument;
  }
  return "";
}

function parseArgs(str = "") {
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

function pickNeedHeaders(src = {}) {
  const dst = {}, lowerMap = {};
  for (const k of Object.keys(src || {})) lowerMap[String(k).toLowerCase()] = src[k];
  const get = (name) => src[name] ?? lowerMap[String(name).toLowerCase()];
  for (const k of NEED_KEYS) {
    const v = get(k);
    if (v !== undefined) dst[k] = v;
  }
  return dst;
}

function getHostFromRequest() {
  const h = ($request && $request.headers) || {};
  const host = h.Host || h.host;
  if (host) return String(host).trim();
  try {
    return new URL($request.url).hostname;
  } catch (_) { return ""; }
}

function headerKeyForHost(host) {
  return `${HEADER_KEY_PREFIX}:${host}`;
}

function readStore(key) {
  if (typeof $persistentStore !== "undefined") {
    return $persistentStore.read(key);
  }
  if (typeof $memory !== "undefined") {
    return $memory.read(key);
  }
  if (typeof $data !== "undefined") {
    return $data.read(key);
  }
  return null;
}

function writeStore(key, value) {
  if (typeof $persistentStore !== "undefined") {
    return $persistentStore.write(value, key);
  }
  if (typeof $memory !== "undefined") {
    return $memory.write(value, key);
  }
  if (typeof $data !== "undefined") {
    return $data.write(value, key);
  }
  return false;
}

function addHostToList(host) {
  try {
    const raw = readStore(HOSTS_LIST_KEY);
    const hosts = safeJsonParse(raw) || [];
    if (!hosts.includes(host)) {
      hosts.push(host);
      writeStore(HOSTS_LIST_KEY, JSON.stringify(hosts));
      console.log("[NewAPI] 已添加站点:", host);
    }
  } catch (e) {
    console.log("[NewAPI] 添加站点失败:", e);
  }
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

function sendNotify(title, subtitle, body) {
  try {
    if (typeof $notification !== "undefined") {
      $notification.post(title, subtitle, body);
    } else if (typeof $notify !== "undefined") {
      $notify(title, subtitle, body);
    }
  } catch (e) {
    console.log("[NewAPI] 通知发送失败:", e);
  }
}

// new-api 的短期 access token 是 JWT；访问令牌(PAT)是普通随机串
function isJwtToken(str) {
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(str || "").trim());
}

function main() {
  const args = parseArgs(getArgument());
  // 默认开启抓取（不依赖模块传参）；需要关闭时显式传 ENABLE_CAPTURE=false
  const enableCapture = !(args.ENABLE_CAPTURE === false || args.ENABLE_CAPTURE === "false");

  if (!enableCapture) {
    console.log("[NewAPI] 抓包已关闭，跳过处理");
    $done({});
    return;
  }

  const allHeaders = ($request && $request.headers) || {};
  const host = getHostFromRequest();
  const url = String(($request && $request.url) || "");
  const picked = pickNeedHeaders(allHeaders);

  if (!host) {
    $done({});
    return;
  }

  const rawAuth = String(picked.Authorization || "").trim();
  const auth = rawAuth.replace(/^Bearer\s+/i, ""); // JWT 形态判断需先去掉前缀
  const jwtLike = isJwtToken(auth);
  const cookieStr = String(picked.Cookie || "");
  const refreshCookieMatch = cookieStr.match(/new_api_refresh=([^;\s,]+)/);
  const isRefreshReq = url.indexOf("/api/user/auth/refresh") !== -1;

  const title = notifyTitleForHost(host);
  const storeKey = headerKeyForHost(host);
  const existingRaw = readStore(storeKey);
  const hasUsableStored = !!existingRaw &&
    (existingRaw.indexOf("new_api_refresh=") !== -1 || /"Authorization"\s*:\s*"Bearer (?!eyJ)/.test(existingRaw));

  // 内容有变化才写存储；首次捕获发通知，之后静默更新避免刷屏
  const saveIfChanged = (tip) => {
    const serialized = JSON.stringify(picked);
    const changed = serialized !== existingRaw;
    let ok = true;
    if (changed) {
      ok = writeStore(storeKey, serialized);
      if (ok) addHostToList(host);
      console.log(`[NewAPI] ${title} | 参数更新 | 已保存 ${Object.keys(picked).length} 个字段`);
    }
    if (!ok) {
      sendNotify(`${title} 参数保存失败`, "", "写入本地存储失败，请检查配置。");
    } else if (changed && !existingRaw) {
      sendNotify(`${title} 参数获取成功`, "", tip);
    }
    $done({});
  };

  // 新版 new-api：refresh 请求携带轮换用的 new_api_refresh Cookie（约30天有效）
  if (isRefreshReq || refreshCookieMatch) {
    if (refreshCookieMatch) {
      delete picked.Authorization; // 短期 JWT 无保存价值
      saveIfChanged("已捕获登录会话（约30天有效），将用于自动签到。注意：该令牌一次一换，脚本刷新后网页端再打开站点需重新登录，属正常现象。");
      return;
    }
    sendNotify("NewAPI 通用签到", "抓包失败", "refresh 请求中未找到 new_api_refresh Cookie，请确认已在站点登录后重试");
    $done({});
    return;
  }

  // 访问令牌（PAT）：非 JWT 格式的 Authorization，长期有效
  if (auth && !jwtLike) {
    saveIfChanged("已捕获访问令牌（长期有效），将用于自动签到。");
    return;
  }

  // 旧版 new-api：Cookie + new-api-user
  if (cookieStr && picked["new-api-user"]) {
    saveIfChanged("已捕获登录 Cookie（旧版接口），将用于自动签到。");
    return;
  }

  // 只有短期 JWT：15分钟即过期，不能直接使用
  if (jwtLike) {
    console.log("[NewAPI] 仅捕获到短期 access token，跳过保存");
    if (!hasUsableStored) {
      sendNotify(
        "NewAPI 通用签到",
        "需要重新获取凭据",
        "当前令牌15分钟即过期。请打开站点页面等待 /api/user/auth/refresh 请求（脚本会自动抓取），或在站点重新登录后重试。"
      );
    }
    $done({});
    return;
  }

  console.log("[NewAPI] 未匹配到可用凭据，跳过", JSON.stringify(allHeaders));
  $done({});
}

main();