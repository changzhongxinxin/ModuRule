export default {
  async fetch(request, env) {
    return handleRequest(env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRequest(env));
  }
};

async function handleRequest(env) {
  const {
    CF_API_TOKEN,
    CF_ZONE_ID,
    CF_DOMAIN,
    RECORD_PREFIX,
    MAX_IPS = '15',
    TTL = '60',
    TG_BOT_TOKEN,
    TG_CHAT_ID
  } = env;

  if (!CF_API_TOKEN || !CF_ZONE_ID || !CF_DOMAIN || !RECORD_PREFIX) {
    return jsonResponse({
      success: false,
      error: '缺少必填变量：CF_API_TOKEN, CF_ZONE_ID, CF_DOMAIN, RECORD_PREFIX'
    }, 400);
  }

  const prefixes = RECORD_PREFIX.split(',').map(s => s.trim()).filter(Boolean);
  const maxIps = parseInt(MAX_IPS, 10) || 15;
  const ttl = parseInt(TTL, 10) || 60;

  try {
    const { topIPs, normalIPs } = await fetchIPs(maxIps);
    const ips = [...topIPs, ...normalIPs].slice(0, maxIps);

    if (ips.length === 0) {
      return jsonResponse({ success: false, error: '未获取到任何可用 IP' }, 500);
    }

    const results = [];
    let hasChanges = false;

    for (const prefix of prefixes) {
      const recordName = prefix === '@' ? CF_DOMAIN : `${prefix}.${CF_DOMAIN}`;
      const existing = await getDNSRecords(CF_API_TOKEN, CF_ZONE_ID, recordName);
      const syncResult = await syncDNSRecords(
        CF_API_TOKEN, CF_ZONE_ID, recordName, ips, existing, ttl
      );
      results.push({ prefix, recordName, ...syncResult });

      if (syncResult.added.length > 0 || syncResult.removed.length > 0) {
        hasChanges = true;
      }
    }

    if (hasChanges && TG_BOT_TOKEN && TG_CHAT_ID) {
      await sendTelegramNotify(TG_BOT_TOKEN, TG_CHAT_ID, results);
    }

    return jsonResponse({
      success: true,
      timestamp: formatChinaTime(),
      totalIPs: ips.length,
      topCount: topIPs.length,
      ipList: ips.map(i => ({ ip: i.ip, latency: i.latency, speedMbps: i.speedMbps, source: i.source })),
      records: results
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

function formatChinaTime() {
  const now = new Date();
  const chinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const year = chinaTime.getFullYear();
  const month = String(chinaTime.getMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getDate()).padStart(2, '0');
  const hours = String(chinaTime.getHours()).padStart(2, '0');
  const minutes = String(chinaTime.getMinutes()).padStart(2, '0');
  const seconds = String(chinaTime.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchIPs(maxIps) {
  const topIPs = [];
  const normalAll = [];

  try {
    const [res10, resTop] = await Promise.all([
      fetch('https://ip.164746.xyz/ipTop10.html', { cf: { cacheTtl: 60 } }),
      fetch('https://ip.164746.xyz/ipTop.html', { cf: { cacheTtl: 60 } })
    ]);

    let top10List = [];
    let top2List = [];

    if (res10.ok) {
      const text10 = await res10.text();
      top10List = text10.split(',').map(s => s.trim()).filter(s => s && /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(s));
    }

    if (resTop.ok) {
      const textTop = await resTop.text();
      top2List = textTop.split(',').map(s => s.trim()).filter(s => s && /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(s));
    }

    const top5From10 = top10List.slice(0, 5);
    const missingTop = top2List.filter(ip => !top5From10.includes(ip));
    const finalTopList = [...missingTop, ...top5From10].slice(0, 5);

    finalTopList.forEach((ip, idx) => {
      topIPs.push({
        ip: ip,
        source: '164746-top',
        latency: idx,
        speedMbps: 999 - idx
      });
    });
  } catch (e) {}

  try {
    const res = await fetch('https://ip.v2too.top/api/nodes?carrier=ct', { cf: { cacheTtl: 60 } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item.ip) {
            normalAll.push({
              ip: item.ip,
              source: 'v2too-ct',
              latency: parseFloat(item.latency) || 999,
              speedMbps: Math.round((parseFloat(item.speed) || 0) * 8)
            });
          }
        });
      }
    }
  } catch (e) {}

  try {
    const res = await fetch('https://ip.v2too.top/api/nodes?carrier=cm', { cf: { cacheTtl: 60 } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach(item => {
          if (item.ip) {
            normalAll.push({
              ip: item.ip,
              source: 'v2too-cm',
              latency: parseFloat(item.latency) || 999,
              speedMbps: Math.round((parseFloat(item.speed) || 0) * 8)
            });
          }
        });
      }
    }
  } catch (e) {}

  const normalMap = new Map();
  normalAll.forEach(item => {
    const old = normalMap.get(item.ip);
    if (!old || item.speedMbps > old.speedMbps) normalMap.set(item.ip, item);
  });

  const normalIPs = Array.from(normalMap.values())
    .sort((a, b) => b.speedMbps - a.speedMbps || a.latency - b.latency);

  return { topIPs, normalIPs };
}

async function getDNSRecords(token, zoneId, name) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!data.success) throw new Error(`获取 DNS 失败: ${JSON.stringify(data.errors)}`);
  return data.result || [];
}

async function createRecord(token, zoneId, name, ip, ttl) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'A', name, content: ip, ttl, proxied: false })
  });
  const data = await res.json();
  if (!data.success) throw new Error(`创建失败: ${JSON.stringify(data.errors)}`);
  return data.result;
}

async function deleteRecord(token, zoneId, recordId) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!data.success) throw new Error(`删除失败: ${JSON.stringify(data.errors)}`);
  return data.result;
}

async function syncDNSRecords(token, zoneId, name, ips, existing, ttl) {
  const result = { added: [], removed: [], kept: [], errors: [] };
  const newIPSet = new Set(ips.map(i => i.ip));
  const existingMap = new Map(existing.map(r => [r.content, r]));

  for (const [ip, record] of existingMap) {
    if (!newIPSet.has(ip)) {
      try { await deleteRecord(token, zoneId, record.id); result.removed.push(ip); }
      catch (e) { result.errors.push({ action: 'delete', ip, error: e.message }); }
    } else {
      result.kept.push(ip);
    }
  }

  for (const ip of newIPSet) {
    if (!existingMap.has(ip)) {
      try { await createRecord(token, zoneId, name, ip, ttl); result.added.push(ip); }
      catch (e) { result.errors.push({ action: 'add', ip, error: e.message }); }
    }
  }
  return result;
}

// ==================== Telegram 通知 ====================

// HTML 模式专用安全转义工具
function safeEscapeHtml(text) {
  if (text === null || text === undefined) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramNotify(botToken, chatId, results) {
  try {
    if (!results || !Array.isArray(results) || results.length === 0) return;

    const lines = [];
    lines.push(`🔄 <b>CF IP 优选更新</b>`);
    lines.push(`⏰ ${safeEscapeHtml(formatChinaTime())}`);
    lines.push('');

    for (const r of results) {
      const addedList = r && Array.isArray(r.added) ? r.added : [];
      const removedList = r && Array.isArray(r.removed) ? r.removed : [];

      if (addedList.length === 0 && removedList.length === 0) continue;

      const recordName = r && r.recordName ? r.recordName : '未知记录';
      // 用 <tg-spoiler> 实现遮罩
      lines.push(`📋 <tg-spoiler>${safeEscapeHtml(recordName)}</tg-spoiler>`);
      lines.push('');
      
      if (addedList.length > 0) {
        lines.push('✅ 新增:');
        for (const ip of addedList) {
          if (ip) lines.push(`  <code>${safeEscapeHtml(ip)}</code>`);
        }
      }

      if (removedList.length > 0) {
        lines.push('❌ 删除:');
        for (const ip of removedList) {
          if (ip) lines.push(`  <code>${safeEscapeHtml(ip)}</code>`);
        }
      }

      lines.push('');
    }

    const text = lines.join('\n');
    if (!text.trim()) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML', // 改用 HTML 解析模式
        disable_web_page_preview: true
      })
    });
  } catch (e) {
    console.error('Telegram 通知发送失败:', e.message);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
