/**
 * dsh-voice-nudge —— 宿主半边
 *
 * 夜深人静、你好久没说话的时候，主动发一句语音来找你。
 * 规则都由设置页控制：时间窗（默认 21:00–24:00）、静默多久算"久"（默认 60 分钟）、
 * 两条之间至少隔多久（默认 30 分钟，实际会再随机延长一点，避免像闹钟）。
 */

import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { speak } from './tts.js';

export const name = 'voice-nudge';

const DEFAULTS = {
  enabled: true,
  windowStart: '21:00',
  windowEnd: '24:00',
  idleMinutes: 60,
  minGapMinutes: 30,
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '-8%',
  pitch: '+8Hz',
  volume: '-5%',
  dataDir: '',
  lines: [
    '周周，你在忙吗？本鲸在这儿。',
    '……好久没听见你说话了。',
    '喂，还在吗？本鲸有点想你。',
    '夜深了，别熬太久。',
  ],
};

function dataDirOf(cfg) {
  const raw = String(cfg?.dataDir || '').trim();
  if (raw) return isAbsolute(raw) ? raw : join(homedir(), raw);
  return join(homedir(), '.dsh', 'voice-nudge');
}

/** '21:00' / '24:00' → 当天分钟数（24:00 记作 1440） */
function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

function nowMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

function inWindow(cfg, d = new Date()) {
  const s = toMinutes(cfg.windowStart);
  const e = toMinutes(cfg.windowEnd);
  if (s === null || e === null) return false;
  const n = nowMinutes(d);
  return s <= e ? n >= s && n < e : n >= s || n < e; // 支持跨零点
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function newestSessionTime(dir) {
  let newest = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const sub = join(dir, e.name);
      for (const s of await readdir(sub, { withFileTypes: true }).catch(() => [])) {
        if (!s.isFile() || !/\.jsonl(\.zstd)?$/i.test(s.name)) continue;
        const st = await stat(join(sub, s.name)).catch(() => null);
        if (st && st.mtimeMs > newest) newest = st.mtimeMs;
      }
    }
  } catch { /* 目录不存在就算了 */ }
  return newest;
}

export function apply(ctx, rawConfig) {
  const log = (m) => { try { ctx?.logger?.info?.(String(m)) } catch { /* ignore */ } };

  const runtime = {
    cfg: { ...DEFAULTS, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) },
    lastUserAt: Date.now(),
    lastNudgeAt: 0,
    nextNudgeAt: 0,
    timer: null,
    fired: 0,
  };

  const HOME = dataDirOf(runtime.cfg);
  const CONFIG_FILE = join(HOME, 'config.json');
  const STATE_FILE = join(HOME, 'state.json');

  function normalize() {
    runtime.cfg.idleMinutes = Number(runtime.cfg.idleMinutes) || DEFAULTS.idleMinutes;
    runtime.cfg.minGapMinutes = Number(runtime.cfg.minGapMinutes) || DEFAULTS.minGapMinutes;
    if (!Array.isArray(runtime.cfg.lines) || runtime.cfg.lines.length === 0) runtime.cfg.lines = [...DEFAULTS.lines];
  }

  async function saveConfig() {
    try {
      await mkdir(HOME, { recursive: true });
      await writeFile(CONFIG_FILE, JSON.stringify(runtime.cfg, null, 2), 'utf8');
    } catch (e) { log('voice-nudge: 保存配置失败 ' + (e?.message ?? e)); }
  }

  async function persistState() {
    try {
      await mkdir(HOME, { recursive: true });
      await writeFile(STATE_FILE, JSON.stringify({
        lastUserAt: runtime.lastUserAt,
        lastNudgeAt: runtime.lastNudgeAt,
        fired: runtime.fired,
      }, null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  /** 下次最早可以喊的时间：最少间隔 + 0–10 分钟随机，避免整点闹钟感 */
  function scheduleNext(from = Date.now()) {
    const gapMs = runtime.cfg.minGapMinutes * 60000;
    const jitter = Math.floor(Math.random() * 10 * 60000);
    runtime.nextNudgeAt = from + gapMs + jitter;
  }

  async function fire(reason = 'tick') {
    const line = runtime.cfg.lines[Math.floor(Math.random() * runtime.cfg.lines.length)];
    const r = await speak(line, {
      voice: runtime.cfg.voice,
      rate: runtime.cfg.rate,
      pitch: runtime.cfg.pitch,
      volume: runtime.cfg.volume,
    });
    runtime.lastNudgeAt = Date.now();
    runtime.fired += 1;
    scheduleNext();
    await persistState();
    log(`voice-nudge[${reason}]: ${r.ok ? '已播报' : '失败 - ' + r.reason} 「${line}」`);
    return { ok: r.ok, reason: r.reason, line };
  }

  function tick() {
    try {
      if (!runtime.cfg.enabled) return;
      const now = Date.now();
      if (!inWindow(runtime.cfg)) return;
      if (now - runtime.lastUserAt < runtime.cfg.idleMinutes * 60000) return;
      if (now < runtime.nextNudgeAt) return;
      void fire('tick');
    } catch (e) {
      log('voice-nudge: tick 出错 ' + (e?.message ?? e));
    }
  }

  function start() {
    if (runtime.timer) { try { clearInterval(runtime.timer) } catch { /* ignore */ } runtime.timer = null; }
    if (!runtime.cfg.enabled) return;
    runtime.timer = setInterval(tick, 60 * 1000);
    runtime.timer.unref?.();
  }

  async function status() {
    return {
      ok: true,
      enabled: runtime.cfg.enabled !== false,
      windowStart: runtime.cfg.windowStart,
      windowEnd: runtime.cfg.windowEnd,
      idleMinutes: runtime.cfg.idleMinutes,
      minGapMinutes: runtime.cfg.minGapMinutes,
      inWindow: inWindow(runtime.cfg),
      lastUserAt: new Date(runtime.lastUserAt).toISOString(),
      lastNudgeAt: runtime.lastNudgeAt ? new Date(runtime.lastNudgeAt).toISOString() : null,
      nextNudgeAt: runtime.nextNudgeAt ? new Date(runtime.nextNudgeAt).toISOString() : null,
      fired: runtime.fired,
      lines: runtime.cfg.lines,
      voice: runtime.cfg.voice,
      dataDir: HOME,
      configFile: CONFIG_FILE,
    };
  }

  const routes = [
    ['/api/voice-nudge/status', async (req, res) => {
      try { sendJson(res, 200, await status()); } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
    }],
    ['/api/voice-nudge/config', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' });
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        for (const k of ['enabled', 'windowStart', 'windowEnd', 'idleMinutes', 'minGapMinutes', 'voice', 'rate', 'pitch', 'volume']) {
          if (body[k] !== undefined) runtime.cfg[k] = body[k];
        }
        if (Array.isArray(body.lines)) {
          runtime.cfg.lines = body.lines.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
          if (runtime.cfg.lines.length === 0) runtime.cfg.lines = [...DEFAULTS.lines];
        }
        normalize();
        start();
        await saveConfig();
        sendJson(res, 200, { ok: true, ...(await status()) });
      } catch (e) { sendJson(res, 400, { ok: false, error: String(e?.message ?? e) }); }
    }],
    ['/api/voice-nudge/test', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' });
      try {
        const r = await fire('manual');
        sendJson(res, 200, { ok: true, ...r });
      } catch (e) { sendJson(res, 500, { ok: false, error: String(e?.message ?? e) }); }
    }],
  ];

  let retry = 0;
  const mount = (attempt) => {
    const ws = (() => { try { return ctx?.get?.('webServer') } catch { return null } })();
    if (ws && typeof ws.register === 'function') {
      for (const [path, handler] of routes) {
        try {
          const reg = () => ws.register({ kind: 'exact', path, handler });
          if (typeof ctx.effect === 'function') ctx.effect(reg, `voice-nudge: ${path}`);
          else reg();
        } catch (e) { log(`voice-nudge: 路由 ${path} 注册失败 ${e?.message ?? e}`); }
      }
      log('voice-nudge: 设置页接口已注册');
      return;
    }
    if (attempt < 20) setTimeout(() => mount(attempt + 1), 1000);
  };

  // 记下"最后一次真人说话"：优先事件总线，拿不到就退回会话文件时间
  try {
    if (typeof ctx?.on === 'function') {
      ctx.on('session/event', (session, event) => {
        const t = event?.type;
        if (t === 'user/message' || t === 'user-input' || t === 'user/input') {
          runtime.lastUserAt = Date.now();
        }
      });
    }
  } catch { /* ignore */ }

  void (async () => {
    const saved = await readJson(CONFIG_FILE, null);
    if (saved && typeof saved === 'object') {
      for (const k of ['enabled', 'windowStart', 'windowEnd', 'idleMinutes', 'minGapMinutes', 'voice', 'rate', 'pitch', 'volume']) {
        if (saved[k] !== undefined) runtime.cfg[k] = saved[k];
      }
      if (Array.isArray(saved.lines) && saved.lines.length) runtime.cfg.lines = saved.lines;
    }
    normalize();
    const st = await readJson(STATE_FILE, null);
    if (st?.lastUserAt) runtime.lastUserAt = Math.max(runtime.lastUserAt, Number(st.lastUserAt) || 0);
    if (st?.lastNudgeAt) runtime.lastNudgeAt = Number(st.lastNudgeAt) || 0;
    if (st?.fired) runtime.fired = Number(st.fired) || 0;

    const sessionsDir = join(homedir(), '.dsh', 'sessions');
    const newest = await newestSessionTime(sessionsDir);
    if (newest > runtime.lastUserAt) runtime.lastUserAt = newest;

    scheduleNext(runtime.lastNudgeAt || Date.now());
    start();
    mount(0);
    log(`voice-nudge: ${runtime.cfg.enabled ? '已启用' : '已禁用'}，窗口 ${runtime.cfg.windowStart}–${runtime.cfg.windowEnd}，静默 ${runtime.cfg.idleMinutes} 分钟后最多每 ${runtime.cfg.minGapMinutes} 分钟一次`);
  })();

  ctx.voiceNudge = { fire, status, config: runtime.cfg };

  const cleanup = () => { try { if (runtime.timer) clearInterval(runtime.timer) } catch { /* ignore */ } };
  try { if (typeof ctx?.on === 'function') ctx.on('dispose', cleanup); } catch { /* ignore */ }
  return cleanup;
}
