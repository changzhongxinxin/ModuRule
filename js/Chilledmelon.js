/**
 * Chilledmelon 自动登录 (终极安全版)
 * 修复了所有作用域提升及 TDZ 报错，逻辑全闭环
 */

// ============ [1. 基础常量与网络配置] ============
const USER_KEY = 'ChilledmelonUserName';
const PASS_KEY = 'ChilledmelonPassWord';
const TOKEN_KEY = 'ChilledmelonToken';

const commonHeaders = {
    'origin': 'https://www.chilledmelon.com',
    'referer': 'https://www.chilledmelon.com/',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
    'accept-encoding': 'gzip, deflate, br'
};

// ============ [2. 全局变量初始化] ============
let username = "";
let password = "";
let token = $persistentStore.read(TOKEN_KEY) || "";
let day = 3;

// ============ [3. 参数与存储解析] ============
// 只先解析 day，username/password 延迟到需要登录时再加载
if (typeof $argument !== "undefined" && $argument) {
    try {
        const params = Object.fromEntries($argument.split('&').map(item => {
            let [key, ...val] = item.split('=');
            return [key, val.join('=')];
        }));
        if (params.day && !isNaN(params.day)) {
            day = Number(params.day);
        }
    } catch (e) {
        console.log("参数解析出错: " + e);
    }
}

// ============ [4. 主逻辑路由] ============
if (!token) {
    console.log("未发现有效 Token，执行首次登录...");
    loadCredentials();
    if (!username || !password) {
        if ($persistentStore.read(USER_KEY) === null) $persistentStore.write("", USER_KEY);
        if ($persistentStore.read(PASS_KEY) === null) $persistentStore.write("", PASS_KEY);
        $notification.post("Chilledmelon 配置提醒", "未检测到账号密码", "请检查模块参数或 BoxJS");
        $done();
    } else {
        doLogin();
    }
} else {
    console.log("发现存储 Token，验证有效性...");
    requestMe();
}

// 新增：按需加载账号密码
function loadCredentials() {
    if (typeof $argument !== "undefined" && $argument) {
        try {
            const params = Object.fromEntries($argument.split('&').map(item => {
                let [key, ...val] = item.split('=');
                return [key, val.join('=')];
            }));
            if (params.username && !params.username.includes("请填写")) username = params.username;
            if (params.password && !params.password.includes("请填写")) password = params.password;
            console.log("用户名"+username);
            console.log("密码"+password);
        } catch (e) {
            console.log("参数解析出错: " + e);
        }
    }
    if (!username) username = $persistentStore.read(USER_KEY) || "";
    if (!password) password = $persistentStore.read(PASS_KEY) || "";
}

// ============ [5. 核心方法区] ============

function requestMe() {
    const options = {
        url: "https://www.chilledmelon.com/api/auth/me",
        headers: { ...commonHeaders, 'x-admin-token': token }
    };

    $httpClient.get(options, (err, resp, data) => {
        if (err) {
            console.log("Me 接口网络请求失败: " + err);
            $notification.post("Chilledmelon", "Me 接口网络请求失败", String(err));
            $done();
            return;
        }
        
        if (resp.status !== 200 || (data && data.includes("未登录"))) {
            console.log("Token 已失效或权限不足，尝试重新登录...");
            loadCredentials();
            if (!username || !password) {
                if ($persistentStore.read(USER_KEY) === null) $persistentStore.write("", USER_KEY);
                if ($persistentStore.read(PASS_KEY) === null) $persistentStore.write("", PASS_KEY);
                $notification.post("Chilledmelon 配置提醒", "未检测到账号密码", "请检查模块参数或 BoxJS");
                $done();
                return;
            }
            doLogin();
        } else {
            console.log("当前登录状态有效。");
            try {
                let json = JSON.parse(data);
                if (json.expiresAt) checkExpire(json.expiresAt);
            } catch (e) {
                console.log("Me 接口数据解析失败");
                $notification.post("Chilledmelon", "Me 接口数据解析失败", String(e));
            }
            $done();
        }
    });
}

function doLogin() {
    const options = {
        url: "https://www.chilledmelon.com/api/auth/login",
        headers: { ...commonHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
    };

    $httpClient.post(options, (err, resp, data) => {
        if (err) {
            console.log("登录接口网络请求失败");
            $notification.post("Chilledmelon", "登录接口网络请求失败", String(err));
            $done();
            return;
        }
        
        if (resp.status !== 200) {
            console.log("登录失败，状态码: " + resp.status);
            $notification.post("Chilledmelon", "登录失败", `状态码: ${resp.status}，请确认账号密码是否正确`);
            $done();
            return;
        }
        
        try {
            let json = JSON.parse(data);
            if (json.accessToken) {
                token = json.accessToken;
                $persistentStore.write(token, TOKEN_KEY);
                console.log("登录成功，新 Token 已更新并保存。");
                if (json.expiresAt) checkExpire(json.expiresAt);
            } else {
                console.log("登录成功，但响应中未提取到 accessToken");
                $notification.post("Chilledmelon", "登录异常", "响应中未提取到 accessToken");
            }
        } catch (e) {
            console.log("解析登录响应 JSON 失败");
            $notification.post("Chilledmelon", "登录响应解析失败", String(e));
        }
        $done();
    });
}

function checkExpire(expireStr) {
    let expireTime = new Date(expireStr).getTime();
    let days = (expireTime - Date.now()) / (1000 * 60 * 60 * 24);
    console.log(`当前订阅剩余天数: ${days.toFixed(2)}`);
    console.log("提前"+day+"天通知。");
    if (days < day) {
        $notification.post("Chilledmelon", "订阅即将过期", `剩余 ${days.toFixed(1)} 天，请及时处理`);
    }
}
