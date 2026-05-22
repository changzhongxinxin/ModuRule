const $ = new Env('MiniApp CK捕获');

if (typeof $request === 'undefined' || !$request.body) {
    $.log('未检测到请求体数据，请检查脚本配置位置');
    $.done();
} else {
    const body = $request.body;
    
    // 简单校验一下是不是有效的 JSON 格式（至少包含 initData 关键字）
    if (!body.includes('initData')) {
        $.log('请求体中未包含 initData，不做处理');
        $.done();
    } else {
        const oldData = $persistentStore.read('MiniApp') || '';

        if (oldData === body) {
            $.log('CK 无变化，跳过保存与通知');
            $.done();
        } else {
            const saveResult = $persistentStore.write(body, 'MiniApp');
            if (saveResult) {
                const subTitle = oldData ? 'CK 已更新' : 'CK 首次保存';
                const display = body.length > 40 ? body.substring(0, 40) + '...' : body;
                $.notify('MiniApp CK捕获 ✅', subTitle, display);
                $.log(`${subTitle}: ${body}`);
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
