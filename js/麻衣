/**
 * MiraiEmby 登录+签到脚本
 * argument: username=xxx&password=yyy
 */

const $ = new API("miraiemby");

// ==================== 解析 argument ====================
const args = parseArgument(typeof $argument !== "undefined" ? $argument : "");

function parseArgument(str) {
  const params = {};
  if (!str) return params;
  str.split("&").forEach(item => {
    const [k, v] = item.split("=");
    if (k && v) params[k.trim()] = decodeURIComponent(v.trim());
  });
  return params;
}

const USERNAME = args.username;
const PASSWORD = args.password;

// ==================== 主流程 ====================
(async () => {
  // 检查配置
  if (!USERNAME || !PASSWORD) {
    $.notify("MiraiEmby", "❌ 配置错误", "argument 格式: username=xxx&password=yyy");
    $.done();
    return;
  }

  try {
    // 1. 登录
    const loginResp = await $.httpRequest({
      url: "https://www.miraiemby.com/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
        "Origin": "https://www.miraiemby.com",
        "Referer": "https://www.miraiemby.com/login"
      },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });

    const loginData = JSON.parse(loginResp.body);

    if (!loginData.token) {
      $.notify("MiraiEmby", "❌ 登录失败", loginData.message || "无 token 返回");
      $.done();
      return;
    }

    // 2. 签到
    const checkinResp = await $.httpRequest({
      url: "https://www.miraiemby.com/api/client/checkin",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${loginData.token}`,
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
        "Origin": "https://www.miraiemby.com",
        "Referer": "https://www.miraiemby.com/dashboard"
      }
    });

    const checkinData = JSON.parse(checkinResp.body);

    if (checkinData.message === "签到成功") {
      $.notify(
        "MiraiEmby 签到成功 ✅",
        `用户: ${loginData.username}`,
        `获得积分: +${checkinData.amount}\n当前余额: ${checkinData.new_balance}`
      );
    } else {
      $.notify("MiraiEmby", "⚠️ 签到结果", checkinData.message || JSON.stringify(checkinData));
    }

  } catch (error) {
    $.notify("MiraiEmby", "❌ 请求失败", error.message || String(error));
  }

  $.done();
})();

// ==================== API 兼容层 ====================
function API(name) {
  return {
    httpRequest(opts) {
      return new Promise((resolve, reject) => {
        if (typeof $task !== "undefined") {
          $task.fetch(opts).then(
            resp => resolve({ status: resp.statusCode, headers: resp.headers, body: resp.body }),
            reason => reject(reason.error)
          );
        } else if (typeof $httpClient !== "undefined") {
          const method = (opts.method || "GET").toLowerCase();
          $httpClient[method](opts, (error, response, body) => {
            if (error) reject(error);
            else resolve({ status: response.status, headers: response.headers, body });
          });
        } else {
          reject(new Error("不支持的环境"));
        }
      });
    },
    notify(title, subtitle, message) {
      if (typeof $notification !== "undefined") {
        $notification.post(title, subtitle, message);
      } else if (typeof $notify !== "undefined") {
        $notify(title, subtitle, message);
      }
    },
    done() {
      if (typeof $done !== "undefined") $done();
    }
  };
}
