function main(config) {
  /**
   * 1. 注入懒人基础网络配置 (修复 proxy-server-nameserver 错误 + DNS 兜底)
   */
  const baseSettings = {
    "allow-lan": true,          // 如不需要局域网共享，建议改为 false
    "bind-address": "*",
    "ipv6": false,
    "unified-delay": true,
    "tcp-concurrent": true,
    "find-process-mode": "strict",
    "profile": { "store-selected": true, "store-fake-ip": true },
    "sniffer": {
      "enable": true,
      "sniff": {
        "HTTP": { "ports": [80, "8080-8880"], "override-destination": true },
        "TLS": { "ports": [443, 8443] },
        "QUIC": { "ports": [443, 8443] }
      },
      "skip-domain": [
        "+.baidu.com",
        "+.local",
        "+.lan",
        "+.qq.com",
        "+.weixin.qq.com"
      ]
    },
    "tun": {
      "enable": true,
      "stack": "mixed",
      "dns-hijack": ["any:53", "tcp://any:53"],
      "auto-route": true,
      "auto-redirect": true,
      "auto-detect-interface": true
    },
    "dns": {
      "enable": true,
      "listen": "0.0.0.0:1053",
      "ipv6": true,
      "enhanced-mode": "fake-ip",
      "fake-ip-range": "198.18.0.1/16",
      "respect-rules": true,
      "fake-ip-filter": [
        "*.lan", "*.local", "+.msftconnecttest.com", "time.*.com", "*.pool.ntp.org",
        "+.stun.*", "*.*.xboxlive.com", "+.microsoft.com", "+.msftncsi.com",
        "+.srv.nintendo.net", "+.stun.playstation.net", "+.turn.twilio.com"
      ],
      // 兜底：纯 IP，确保首次启动/DoH 异常时仍能解析
      "default-nameserver": ["223.5.5.5", "114.114.114.114"],
      // 代理服务器域名解析专用
      "proxy-server-nameserver": [
        "https://223.5.5.5/dns-query",
        "https://119.29.29.29/dns-query"
      ],
      "nameserver": [
        "https://223.5.5.5/dns-query", 
        "https://119.29.29.29/dns-query"
      ],
      // 兜底 fallback：当上游异常时回退到国际 DNS
      "fallback": ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"],
      "fallback-filter": { "geoip": false, "geoip-code": "CN", "ipcidr": ["240.0.0.0/4"] }
    }
  };

  // 覆盖基础设置
  Object.assign(config, baseSettings);

  /**
   * 2. 节点提取与清洗 (正则更精准，减少误杀)
   */
  const allProxyNames = (config.proxies || []).map((p) => p.name);
  // 仅匹配纯信息类节点名，避免误杀含关键词的正常节点
  const trashRegex = /^(流量|时间|重置|官网|客服|订阅|Expired|Remaining|到期|距离|群组|地址|验证|公告|通知|有效)/i;
  const validProxies = allProxyNames.filter(name => !trashRegex.test(name));
  // ===== 插入到这里：为每个代理注入 client-fingerprint =====
  (config.proxies || []).forEach(p => {
    if (p.tls || p['skip-cert-verify'] !== undefined) {
      p['client-fingerprint'] = 'chrome';
    }
  });
  const getProxies = (regex) => {
    const res = validProxies.filter(name => regex.test(name));
    // 无匹配时 fallback 到自动选择，避免意外直连暴露流量
    return res.length > 0 ? res : ["自动选择"];
  };

  /**
   * 3. 策略组重写
   */
  config["proxy-groups"] = [
    { name: "Proxy", type: "select", proxies: ["自动选择", "香港", "日本", "美国", "台湾", "新加坡", "韩国", "欧盟地区"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Global.png" },
    { name: "自动选择", type: "url-test", url: "http://www.gstatic.com/generate_204", interval: 300, tolerance: 50, proxies: validProxies.length > 0 ? validProxies : ["DIRECT"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Speedtest.png" },
    { name: "Emby", type: "select", proxies: ["DIRECT", "自动选择", "香港", "新加坡", "美国"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Apple_TV.png" },
    { name: "人工智能", type: "select", proxies: ["美国", "日本", "新加坡", "台湾", "欧盟地区", "Proxy"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/ChatGPT.png" },
    { name: "国际媒体", type: "select", proxies: ["Proxy", "香港", "日本", "美国", "台湾", "欧盟地区"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Streaming.png" },
    { name: "Telegram", type: "select", proxies: ["Proxy", "新加坡", "香港", "欧盟地区"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Telegram.png" },
    { name: "微软服务", type: "select", proxies: ["DIRECT", "Proxy", "自动选择"], icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Microsoft.png" },

    { name: "香港", type: "url-test", proxies: getProxies(/(香港|HK|Hong Kong)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Hong_Kong.png" },
    { name: "日本", type: "url-test", proxies: getProxies(/(日本|JP|Japan|Tokyo|Osaka)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Japan.png" },
    { name: "美国", type: "url-test", proxies: getProxies(/(美国|US|United States|America)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/United_States.png" },
    { name: "台湾", type: "url-test", proxies: getProxies(/(台湾|TW|Taiwan|Taipei)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Taiwan.png" },
    { name: "新加坡", type: "url-test", proxies: getProxies(/(新加坡|SG|Singapore|Lion)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Singapore.png" },
    { name: "韩国", type: "url-test", proxies: getProxies(/(韩国|KR|Korea|Seoul)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Korea.png" },
    { name: "欧盟地区", type: "url-test", proxies: getProxies(/(英国|UK|GB|英|法|FR|德|DE|意|IT|荷兰|NL|欧|EU)/i), interval: 300, tolerance: 50, icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/European_Union.png" }
  ];

    /**
   * 4. 远程规则集注入 (精简版：合并 AI 与媒体，替换为提供的规则集)
   */
  config["rule-providers"] = {
    reject: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/AdvertisingLite/AdvertisingLite_Classical.yaml", path: "./ruleset/reject.yaml" },
    Google: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.yaml", path: "./ruleset/google.yaml" },
    telegram: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://fastly.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Telegram/Telegram.yaml", path: "./ruleset/telegram.yaml" },
    github: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.yaml", path: "./ruleset/github.yaml" },
    ai: { type: "http", behavior: "classical", format: "text", interval: 86400, url: "https://fastly.jsdelivr.net/gh/Repcz/Tool@X/Surge/Rules/AI.list", path: "./ruleset/ai.list" },
    global: { type: "http", behavior: "domain", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Global/Global_Domain.yaml", path: "./ruleset/global.yaml" },
    proxy: { type: "http", behavior: "domain", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Proxy/Proxy_Domain.yaml", path: "./ruleset/proxy.yaml" },
    globalmedia: { type: "http", behavior: "domain", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GlobalMedia/GlobalMedia_Domain.yaml", path: "./ruleset/globalmedia.yaml" },
    china: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China_Classical.yaml", path: "./ruleset/china.yaml" },
    Emby: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/changzhongxinxin/ModuRule/refs/heads/main/Rule/Clash/Emby.yaml", path: "./ruleset/emby.yaml" },
    microsoft: { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.yaml", path: "./ruleset/microsoft.yaml"},
    "直连": { type: "http", behavior: "classical", format: "yaml", interval: 86400, url: "https://raw.githubusercontent.com/changzhongxinxin/ModuRule/refs/heads/main/Rule/Clash/直连.yaml", path: "./ruleset/直连.yaml" }
  };

  /**
   * 5. 规则重写 (顺序：拒绝/直连 → 特定应用 → 全局代理 → geo → 兜底)
   */
  config.rules = [
    "RULE-SET,reject,REJECT",
    "RULE-SET,china,DIRECT",
    "RULE-SET,直连,DIRECT",
    "RULE-SET,Emby,Emby",
    "RULE-SET,ai,人工智能",
    "RULE-SET,globalmedia,国际媒体",
	"RULE-SET,microsoft,微软服务",
    "RULE-SET,telegram,Telegram",
    "RULE-SET,Google,Proxy",
    "RULE-SET,github,Proxy",
    "RULE-SET,global,Proxy",
    "RULE-SET,proxy,Proxy",
    "GEOSITE,CN,DIRECT",
    "GEOIP,CN,DIRECT,no-resolve",
    "MATCH,Proxy"
  ];
  return config;
}