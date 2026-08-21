import type { VoiceSettings } from './types'

export interface NarrationLine { id: string; label: string; text: string }

export const NARRATION_LINES: NarrationLine[] = [
  { id: 'dawn-intro', label: '黎明 · 语音一', text: '黎明开始，所有人请闭眼。女巫请睁眼，请选择放置黑猫的对象。女巫可以选择任意玩家，包括自己。' },
  { id: 'dawn-complete', label: '黎明 · 语音二', text: '黑猫已放置，女巫请闭眼。三、二、一，天亮了，请所有玩家睁眼。' },
  { id: 'night-intro', label: '夜晚 · 语音一', text: '夜晚降临，所有玩家天黑请闭眼。接下来，请所有曾是女巫或现在是女巫的玩家睁眼，决定你们今晚要谋杀的对象。女巫可以谋杀任何人，包括自己。' },
  { id: 'witch-complete-sheriff', label: '夜晚 · 语音二（有警长）', text: '谋杀对象已选择，女巫请闭眼。三、二、一。警长请睁眼，选择你今晚要保护的对象。注意，警长不可以保护自己。' },
  { id: 'sheriff-complete', label: '夜晚 · 语音三（警长选择后）', text: '对象已选择。警长请闭眼。三、二、一，天亮了，请所有玩家睁眼。' },
  { id: 'witch-complete-no-sheriff', label: '夜晚 · 无警长结束语音', text: '谋杀对象已选择，女巫请闭眼。三、二、一。天亮了，请所有玩家睁眼。' },
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

async function prepareBuiltInFile(relativePath: string) {
  const url = `${import.meta.env.BASE_URL}${relativePath}`
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

export const prepareBuiltInBgm = () => prepareBuiltInFile('audio/M800002dNKFX14MVND.mp3')
const prepareBuiltInNarration = (id: string) => prepareBuiltInFile(`audio/narration/${id}.mp3`)

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
    const audioBlob = await cachedAudio(line.id) ?? await prepareBuiltInNarration(line.id)
    if (audioBlob) {
      const player = await playBlob(audioBlob)
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

