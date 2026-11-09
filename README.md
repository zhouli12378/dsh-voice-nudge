# dsh-voice-nudge

> 夜深了还没人说话，就主动发一句语音来找你。

## 它做什么

在设定的时间窗内（默认 21:00–24:00），如果已经很久没人和 AI 说话（默认 60 分钟），
就随机挑一句配置好的话，用 Edge TTS 念出来。两次之间至少隔 30 分钟，还会再随机加 0–10 分钟，
避免听起来像闹钟。

## 安装

```bash
pnpm add github:zhouli12378/dsh-voice-nudge
```

装完在 profile 的 `dsh.profile.bundles` 里加上 `dsh-voice-nudge`，重启 DSH。
设置里会出现一页「深夜找你」。

## 依赖

- 需要 `@andresaya/edge-tts`（Edge 免费 TTS，无需 key）
- 播放走 Windows PowerShell 的 MediaPlayer；非 Windows 平台会如实报「播放未实现」，不会假装成功

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `windowStart` / `windowEnd` | `21:00` / `24:00` | 时间窗，支持跨零点 |
| `idleMinutes` | `60` | 多久没说话才算「久」 |
| `minGapMinutes` | `30` | 两次之间最少间隔 |
| `lines` | 四句默认 | 随机挑选要念的话 |
| `voice` | `zh-CN-XiaoxiaoNeural` | Edge TTS 音色 |

## 日志

设置页能看到「距上次说话多少分钟 / 上次主动什么时候 / 累计几次」；
配置存在 `~/.dsh/voice-nudge/config.json`（可用 `dataDir` 改位置）。

## 许可

MIT