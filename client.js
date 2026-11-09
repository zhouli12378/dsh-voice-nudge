/**
 * dsh-voice-nudge —— 浏览器半边（设置页「深夜找你」）
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-nudge',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const API = '/api/voice-nudge';
    const BUILD = 1;

    const asJson = async (res) => { if (res.ok) return res.json(); throw new Error('HTTP ' + res.status); };
    const jget = async (p) => asJson(await fetch(API + p, { credentials: 'same-origin' }));
    const jpost = async (p, body) => asJson(await fetch(API + p, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
    }));

    const CSS = `
      .vn-wrap { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 18px; }
      .vn-card { border: 1px solid rgba(127,127,127,.22); border-radius: 12px; padding: 14px 16px; }
      .vn-title { font-weight: 600; margin: 0 0 10px; font-size: 15px; }
      .vn-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; flex-wrap: wrap; }
      .vn-label { min-width: 140px; opacity: .86; font-size: 13px; }
      .vn-input { flex: 1; min-width: 160px; padding: 6px 9px; border-radius: 8px;
                  border: 1px solid rgba(127,127,127,.34); background: transparent; color: inherit; font: inherit; }
      .vn-area { width: 100%; min-height: 120px; padding: 8px 10px; border-radius: 8px;
                 border: 1px solid rgba(127,127,127,.34); background: transparent; color: inherit; font: inherit; }
      .vn-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(127,127,127,.34);
                background: rgba(127,127,127,.10); color: inherit; font: inherit; cursor: pointer; }
      .vn-btn.primary { background: rgba(80,140,255,.18); border-color: rgba(80,140,255,.45); }
      .vn-note { font-size: 12px; opacity: .66; line-height: 1.6; }
      .vn-err { color: #e06c75; font-size: 13px; }
      .vn-ok { color: #67c07a; font-size: 13px; }
    `;

    function Panel() {
      const [st, setSt] = React.useState(null);
      const [form, setForm] = React.useState(null);
      const [busy, setBusy] = React.useState('');
      const [err, setErr] = React.useState('');
      const [msg, setMsg] = React.useState('');

      const applyState = (s) => {
        setSt(s);
        setForm({
          enabled: s.enabled,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
          idleMinutes: s.idleMinutes,
          minGapMinutes: s.minGapMinutes,
          voice: s.voice,
          lines: (s.lines || []).join('\n'),
        });
      };

      React.useEffect(() => { jget('/status').then(applyState).catch((e) => setErr('读状态失败：' + e.message)); }, []);

      const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

      const save = async () => {
        setBusy('save'); setErr(''); setMsg('');
        try {
          const body = { ...form, lines: String(form.lines).split('\n').map((s) => s.trim()).filter(Boolean) };
          const s = await jpost('/config', body);
          applyState(s);
          setMsg('已保存。');
        } catch (e) { setErr('保存失败：' + e.message); }
        setBusy('');
      };

      const test = async () => {
        setBusy('test'); setErr(''); setMsg('');
        try {
          const r = await jpost('/test', {});
          setMsg(r.ok ? '已播报：「' + r.line + '」' : '没播出来：' + (r.reason || ''));
          applyState(await jget('/status'));
        } catch (e) { setErr('测试失败：' + e.message); }
        setBusy('');
      };

      if (!st || !form) return h('div', { className: 'vn-wrap' }, h('p', { className: 'vn-note' }, err || '加载中…'));

      const idle = Math.round((Date.now() - Date.parse(st.lastUserAt)) / 60000);

      return h('div', { className: 'vn-wrap' },
        h('div', { className: 'vn-card' },
          h('p', { className: 'vn-title' }, '深夜找你'),
          h('p', { className: 'vn-note' },
            '在设定时间窗内，如果你已经很久没说话，就主动发一句语音过来。'),
          h('p', { className: 'vn-note' },
            '状态：' + (st.inWindow ? '在时间窗内' : '不在时间窗内')
            + ' · 距上次说话 ' + idle + ' 分钟'
            + ' · 上次主动 ' + (st.lastNudgeAt ? new Date(st.lastNudgeAt).toLocaleString() : '还没喊过')
            + ' · 累计 ' + st.fired + ' 次')),

        h('div', { className: 'vn-card' },
          h('p', { className: 'vn-title' }, '规则'),
          h('div', { className: 'vn-row' }, h('span', { className: 'vn-label' }, '启用'),
            h('select', { className: 'vn-input', value: String(form.enabled), onChange: (e) => setForm((f) => ({ ...f, enabled: e.target.value === 'true' })) },
              h('option', { value: 'true' }, '开启'), h('option', { value: 'false' }, '关闭'))),
          h('div', { className: 'vn-row' }, h('span', { className: 'vn-label' }, '时间窗'),
            h('input', { className: 'vn-input', value: form.windowStart, onChange: set('windowStart'), placeholder: '21:00' }),
            h('span', { className: 'vn-note' }, '到'),
            h('input', { className: 'vn-input', value: form.windowEnd, onChange: set('windowEnd'), placeholder: '24:00' }),
            h('span', { className: 'vn-note' }, '（支持跨零点）')),
          h('div', { className: 'vn-row' }, h('span', { className: 'vn-label' }, '多久没说话才算久'),
            h('input', { className: 'vn-input', type: 'number', min: 5, value: form.idleMinutes, onChange: set('idleMinutes') }),
            h('span', { className: 'vn-note' }, '分钟')),
          h('div', { className: 'vn-row' }, h('span', { className: 'vn-label' }, '两次之间至少隔'),
            h('input', { className: 'vn-input', type: 'number', min: 5, value: form.minGapMinutes, onChange: set('minGapMinutes') }),
            h('span', { className: 'vn-note' }, '分钟（会再随机加 0–10 分钟）')),
          h('div', { className: 'vn-row' }, h('span', { className: 'vn-label' }, '音色'),
            h('input', { className: 'vn-input', value: form.voice, onChange: set('voice') }))),

        h('div', { className: 'vn-card' },
          h('p', { className: 'vn-title' }, '会说的话（一行一句，随机挑）'),
          h('textarea', { className: 'vn-area', value: form.lines, onChange: set('lines') }),
          h('p', { className: 'vn-note' }, '留空则用默认几句。')),

        h('div', { className: 'vn-row' },
          h('button', { className: 'vn-btn primary', disabled: !!busy, onClick: save }, busy === 'save' ? '保存中…' : '保存'),
          h('button', { className: 'vn-btn', disabled: !!busy, onClick: test }, busy === 'test' ? '播放中…' : '试一句（立刻出声）')),

        err ? h('p', { className: 'vn-err' }, err) : null,
        msg ? h('p', { className: 'vn-ok' }, msg) : null,

        h('p', { className: 'vn-note' }, '数据目录：' + st.dataDir + ' · 面板 v' + BUILD));
    }

    class Boundary extends React.Component {
      constructor(p) { super(p); this.state = { err: '' }; }
      static getDerivedStateFromError(e) { return { err: String(e && e.message ? e.message : e) }; }
      render() {
        if (this.state.err) {
          return h('div', { className: 'vn-wrap' },
            h('p', { className: 'vn-err' }, '这页出错了：' + this.state.err),
            h('button', { className: 'vn-btn', onClick: () => this.setState({ err: '' }) }, '重试'));
        }
        return this.props.children;
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style');
        style.setAttribute('data-plugin-css', 'dsh-voice-nudge');
        style.textContent = CSS;
        document.head.appendChild(style);
        if (typeof ctx.effect === 'function') ctx.effect(() => () => style.remove(), 'dsh-voice-nudge: 设置页样式');

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots;
        if (!slots) return;
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'voice-nudge', order: 47, label: '深夜找你' },
          () => h(Boundary, null, h(Panel)),
        ));
      },
    };
  },
});
