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

interface AudioPlayer { audio: HTMLAudioElement; finished: Promise<void>; dispose: () => void }
interface SpeechPlayback {
  text: string
  settings: VoiceSettings
  charIndex: number
  utterance: SpeechSynthesisUtterance | null
  resolve: () => void
  settled: boolean
}

let playbackGeneration = 0
let bgmGeneration = 0
let speechRestartGeneration = 0
let activeNarration: AudioPlayer | null = null
let activeBgm: AudioPlayer | null = null
let activeSpeech: SpeechPlayback | null = null

async function playBlob(blob: Blob, loop = false, volume = 1): Promise<AudioPlayer> {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url); audio.loop = loop; audio.volume = volume
  let settled = false
  let resolveFinished = () => {}
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve })
  const settle = () => { if (!settled) { settled = true; resolveFinished() } }
  audio.onended = settle; audio.onerror = settle
  const dispose = () => {
    if (settled && !loop) { URL.revokeObjectURL(url); return }
    audio.pause(); audio.removeAttribute('src'); audio.load(); settle(); URL.revokeObjectURL(url)
  }
  try { await audio.play() } catch (error) { dispose(); throw error }
  return { audio, finished, dispose }
}

function finishSpeechPlayback(playback: SpeechPlayback) {
  if (playback.settled) return
  playback.settled = true
  if (activeSpeech === playback) activeSpeech = null
  playback.resolve()
}

function startSpeechPlayback(playback: SpeechPlayback) {
  if (playback.settled || activeSpeech !== playback) return
  const startIndex = playback.charIndex
  const utterance = new SpeechSynthesisUtterance(playback.text.slice(startIndex))
  utterance.lang = 'zh-CN'; utterance.rate = playback.settings.rate; utterance.pitch = 0.88; utterance.volume = playback.settings.narrationVolume
  const voice = chineseVoice(); if (voice) utterance.voice = voice
  utterance.onboundary = (event) => { if (playback.utterance === utterance) playback.charIndex = startIndex + event.charIndex }
  utterance.onend = () => { if (playback.utterance === utterance) finishSpeechPlayback(playback) }
  utterance.onerror = () => { if (playback.utterance === utterance) finishSpeechPlayback(playback) }
  playback.utterance = utterance
  window.speechSynthesis.speak(utterance)
}

async function speakText(text: string, settings: VoiceSettings) {
  await new Promise<void>((resolve) => {
    speechRestartGeneration += 1
    const playback: SpeechPlayback = { text, settings, charIndex: 0, utterance: null, resolve, settled: false }
    activeSpeech = playback
    startSpeechPlayback(playback)
  })
}

export function stopSpeech() {
  playbackGeneration += 1
  speechRestartGeneration += 1
  const speech = activeSpeech
  if (speech?.utterance) { speech.utterance.onend = null; speech.utterance.onerror = null }
  window.speechSynthesis?.cancel()
  if (speech) finishSpeechPlayback(speech)
  activeNarration?.dispose(); activeNarration = null
}

export async function speakLines(lines: NarrationLine[], settings: VoiceSettings) {
  if (!settings.enabled) return
  const generation = playbackGeneration
  for (const line of lines) {
    const audioBlob = await cachedAudio(line.id) ?? await prepareBuiltInNarration(line.id)
    if (generation !== playbackGeneration) return
    if (audioBlob) {
      try {
        const player = await playBlob(audioBlob, false, settings.narrationVolume)
        if (generation !== playbackGeneration) { player.dispose(); return }
        activeNarration = player
        await player.finished
        if (activeNarration === player) activeNarration = null
        player.dispose()
      } catch { if (generation === playbackGeneration && 'speechSynthesis' in window) await speakText(line.text, settings) }
    } else if ('speechSynthesis' in window) await speakText(line.text, settings)
    if (generation !== playbackGeneration) return
    await pause(460)
  }
}

export async function startBackgroundMusic(settings: VoiceSettings) {
  stopBackgroundMusic()
  const generation = bgmGeneration
  if (!settings.enabled) return
  const blob = await cachedAudio('bgm') ?? await prepareBuiltInBgm()
  if (!blob || generation !== bgmGeneration) return
  try {
    const player = await playBlob(blob, true, settings.bgmVolume)
    if (generation !== bgmGeneration) player.dispose()
    else activeBgm = player
  } catch { activeBgm = null }
}

export function setBackgroundMusicVolume(volume: number) { if (activeBgm) activeBgm.audio.volume = volume }

export function setNarrationVolume(volume: number) {
  if (activeNarration) activeNarration.audio.volume = volume
  const speech = activeSpeech
  if (!speech || speech.settled) return
  speech.settings = { ...speech.settings, narrationVolume: volume }
  if (speech.utterance) { speech.utterance.onend = null; speech.utterance.onerror = null }
  window.speechSynthesis.cancel()
  const restart = ++speechRestartGeneration
  window.setTimeout(() => { if (restart === speechRestartGeneration) startSpeechPlayback(speech) }, 0)
}

export function stopBackgroundMusic() {
  bgmGeneration += 1
  activeBgm?.dispose(); activeBgm = null
}

export function stopAllAudio() { stopSpeech(); stopBackgroundMusic() }

