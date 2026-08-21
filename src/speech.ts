import type { VoiceSettings } from './types'

export interface NarrationLine { id: string; label: string; text: string }

export const NARRATION_LINES: NarrationLine[] = [
  { id: 'dawn-start', label: '黎明开始', text: '黎明阶段开始。' },
  { id: 'all-close-eyes', label: '所有人闭眼', text: '所有人闭眼。' },
  { id: 'witch-open-eyes', label: '女巫睁眼', text: '女巫请睁眼。' },
  { id: 'black-cat-select', label: '选择黑猫对象', text: '请选择放置黑猫的对象。' },
  { id: 'witch-any-player', label: '女巫选择规则', text: '女巫可以选择任意玩家，包括自己。' },
  { id: 'black-cat-placed', label: '黑猫已放置', text: '黑猫已放置。' },
  { id: 'witch-close-eyes', label: '女巫闭眼', text: '女巫请闭眼。' },
  { id: 'day-breaks', label: '天亮', text: '天亮了。' },
  { id: 'night-falls', label: '夜晚降临', text: '夜晚降临。' },
  { id: 'witch-kill-select', label: '选择谋杀对象', text: '请选择今晚要谋杀的对象。' },
  { id: 'target-selected', label: '对象已选择', text: '对象已选择。' },
  { id: 'sheriff-open-eyes', label: '警长睁眼', text: '警长请睁眼。' },
  { id: 'sheriff-select', label: '选择保护对象', text: '请选择需要保护的对象。' },
  { id: 'sheriff-rule', label: '警长选择规则', text: '警长不能保护自己。' },
  { id: 'sheriff-close-eyes', label: '警长闭眼', text: '警长请闭眼。' },
  { id: 'results-intro', label: '公布结果', text: '昨夜行动结果如下。' },
]

const ASSET_CACHE = 'nightfall-custom-audio-v1'
const BUILTIN_CACHE = 'nightfall-builtin-audio-v1'
const ASSET_META_KEY = 'nightfall-companion:audio-assets'
const assetUrl = (id: string) => `https://nightfall.local/audio/${encodeURIComponent(id)}`
export const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function chineseVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn') ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('zh'))
}

function loadAssetNames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ASSET_META_KEY) ?? '{}') }
  catch { return {} }
}

export const getAudioAssetNames = () => loadAssetNames()

export async function saveAudioAsset(id: string, file: File) {
  if (!('caches' in window)) throw new Error('当前浏览器不支持离线音频缓存')
  const cache = await caches.open(ASSET_CACHE)
  await cache.put(assetUrl(id), new Response(file, { headers: { 'Content-Type': file.type || 'audio/mpeg' } }))
  const names = loadAssetNames(); names[id] = file.name
  localStorage.setItem(ASSET_META_KEY, JSON.stringify(names))
  return names
}

export async function removeAudioAsset(id: string) {
  if ('caches' in window) await (await caches.open(ASSET_CACHE)).delete(assetUrl(id))
  const names = loadAssetNames(); delete names[id]
  localStorage.setItem(ASSET_META_KEY, JSON.stringify(names))
  return names
}

async function cachedAudio(id: string) {
  if (!('caches' in window)) return null
  const response = await (await caches.open(ASSET_CACHE)).match(assetUrl(id))
  return response ? response.blob() : null
}

export async function prepareBuiltInBgm() {
  const url = `${import.meta.env.BASE_URL}audio/M800002dNKFX14MVND.mp3`
  if (!('caches' in window)) {
    try { const response = await fetch(url); return response.ok ? response.blob() : null } catch { return null }
  }
  const cache = await caches.open(BUILTIN_CACHE)
  const stored = await cache.match(url)
  if (stored) return stored.blob()
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    await cache.put(url, response.clone())
    return response.blob()
  } catch { return null }
}

async function playBlob(blob: Blob, loop = false, volume = 1) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url); audio.loop = loop; audio.volume = volume
  await audio.play()
  return { audio, dispose: () => { audio.pause(); URL.revokeObjectURL(url) } }
}

async function speakText(text: string, settings: VoiceSettings) {
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'; utterance.rate = settings.rate; utterance.pitch = 0.88; utterance.volume = 1
    const voice = chineseVoice(); if (voice) utterance.voice = voice
    utterance.onend = () => resolve(); utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeech() { window.speechSynthesis?.cancel() }

export async function speakLines(lines: NarrationLine[], settings: VoiceSettings) {
  if (!settings.enabled) return
  for (const line of lines) {
    const custom = await cachedAudio(line.id)
    if (custom) {
      const player = await playBlob(custom)
      await new Promise<void>((resolve) => { player.audio.onended = () => resolve(); player.audio.onerror = () => resolve() })
      player.dispose()
    } else if ('speechSynthesis' in window) await speakText(line.text, settings)
    await pause(460)
  }
}

export async function withBackgroundMusic(settings: VoiceSettings, action: () => Promise<void>) {
  let bgm: Awaited<ReturnType<typeof playBlob>> | null = null
  if (settings.enabled) {
    const blob = await cachedAudio('bgm') ?? await prepareBuiltInBgm()
    if (blob) try { bgm = await playBlob(blob, true, settings.bgmVolume) } catch { bgm = null }
  }
  try { await action() } finally { bgm?.dispose() }
}

