/**
 * dsh-voice-nudge —— TTS 小工具（Edge TTS 合成 + Windows 播放）
 *
 * 依赖：@andresaya/edge-tts（npm）。播放走 PowerShell 的 MediaPlayer，
 * 非 Windows 平台会直接跳过并给出原因，不假装成功。
 */

import { writeFile, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

const isWindows = process.platform === 'win32';

/** 合成一段 mp3，返回文件路径；失败抛错（不回退成"假装说了"）。 */
export async function synthesize(text, { voice = 'zh-CN-XiaoxiaoNeural', rate = '-8%', pitch = '+8Hz', volume = '-5%' } = {}) {
  const mod = await import('@andresaya/edge-tts');
  const TTS = mod.EdgeTTS ?? mod.default?.EdgeTTS ?? mod.default;
  if (!TTS) throw new Error('找不到 EdgeTTS 导出（@andresaya/edge-tts 版本变了？）');
  const tts = new TTS();
  const prosody = { rate, pitch, volume };
  const file = join(tmpdir(), `nudge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
  const res = await tts.generate(text, voice, prosody);
  const audio = res?.audio ?? res;
  if (!audio || !audio.length) throw new Error('Edge TTS 没有返回音频');
  await writeFile(file, audio);
  return file;
}

/** 播放 mp3，播完（或超时）返回。非 Windows 直接返回 false。 */
export function playMp3(file, { timeoutMs = 40000 } = {}) {
  if (!isWindows) return Promise.resolve(false);
  return new Promise((resolve) => {
    // 时长按文件大小估：中文约每字 0.25–0.3 秒，mp3 约 3.5KB/s
    stat(file).then((s) => {
      const sec = Math.min(40, Math.max(4, Math.round(s.size / 3500)));
      const ps = [
        'Add-Type -AssemblyName PresentationCore;',
        '$p = New-Object System.Windows.Media.MediaPlayer;',
        `$p.Open([uri]'${file.replace(/'/g, "''")}');`,
        '$p.Volume = 1.0;',
        'Start-Sleep -Milliseconds 400;',
        '$p.Play();',
        `Start-Sleep -Seconds ${sec};`,
        '$p.Close();',
      ].join(' ');
      execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: timeoutMs }, () => resolve(true));
    }).catch(() => resolve(false));
  });
}

/** 合成并播放一句话；返回 { ok, reason }。 */
export async function speak(text, opts = {}) {
  if (!isWindows) return { ok: false, reason: '当前系统不是 Windows，播放未实现' };
  let file = '';
  try {
    file = await synthesize(text, opts);
  } catch (e) {
    return { ok: false, reason: 'TTS 合成失败：' + (e?.message ?? e) };
  }
  try {
    const played = await playMp3(file);
    return played ? { ok: true } : { ok: false, reason: '播放失败' };
  } finally {
    unlink(file).catch(() => {});
  }
}
