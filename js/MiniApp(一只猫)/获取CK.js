
const $ = new Env('MiniApp CK捕获');

const headers = $request.headers;
const xSession = headers['X-Session'] || headers['x-session'] || '';

let token = '';
let source = '';

if (xSession) {
    token = xSession;
    source = 'x-session';
} else {
    const cookie = headers['Cookie'] || headers['cookie'] || '';
    const match = cookie.match(/qp_session=([^;]+)/);
    if (match) {
        token = match[1];  // 这里提取的就是纯值，前缀已去掉
        source = 'cookie';
    }
}

// 空指针处理
if (!token) {
    $.log('x-session 与 qp_session 均为空，不做处理');
    $.done();
}

// 读取旧数据比较（裸值比较）
const oldData = $persistentStore.read('MiniApp') || '';

if (oldData === token) {
    $.log('CK 无变化，跳过保存与通知');
    $.done();
}

// 保存裸 token，不加任何前缀
const saveResult = $persistentStore.write(token, 'MiniApp');
if (saveResult) {
    const subTitle = oldData ? `CK 已更新 (来自${source})` : `CK 首次保存 (来自${source})`;
    $.notify('MiniApp CK捕获 ✅', subTitle, token.length > 40 ? token.substring(0, 40) + '...' : token);
    $.log(`${subTitle}: ${token}`);
} else {
    $.notify('MiniApp CK捕获 ⚠️', '持久化写入失败', '请检查 Surge 存储权限');
}

$.done();

function Env(name) {
    this.name = name;
    this.log = (msg) => console.log(`[${this.name}] ${msg}`);
    this.notify = (title, subtitle, message) => $notification.post(title, subtitle, message);
    this.done = () => $done();
}
