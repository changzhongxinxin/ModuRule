const $ = new Env('MiniApp CK捕获');

if (typeof $request === 'undefined' || !$request.body) {
    $.log('未检测到请求体数据，请检查脚本配置位置');
    $.done();
} else {
    let body;
    try {
        body = JSON.parse($request.body);
    } catch (e) {
        $.log('请求体 JSON 解析失败，不做处理');
        $.done();
    }

    const token = body.initData || '';
    const source = 'initData';

    if (!token) {
        $.log('initData 为空，不做处理');
        $.done();
    } else {
        const oldData = $persistentStore.read('MiniApp') || '';

        if (oldData === token) {
            $.log('CK 无变化，跳过保存与通知');
            $.done();
        } else {
            const saveResult = $persistentStore.write(token, 'MiniApp');
            if (saveResult) {
                const subTitle = oldData ? `CK 已更新 (来自${source})` : `CK 首次保存 (来自${source})`;
                $.notify('MiniApp CK捕获 ✅', subTitle, token.length > 40 ? token.substring(0, 40) + '...' : token);
                $.log(`${subTitle}: ${token}`);
            } else {
                $.notify('MiniApp CK捕获 ⚠️', '持久化写入失败', '请检查存储权限');
            }
            $.done();
        }
    }
}

function Env(name) {
    this.name = name;
    this.log = (msg) => console.log(`[${this.name}] ${msg}`);
    this.notify = (title, subtitle, message) => $notification.post(title, subtitle, message);
    this.done = () => $done();
}
