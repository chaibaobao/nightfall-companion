import type { VoiceSettings } from './types'

const pause = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

function chineseVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('zh'))
}

export function stopSpeech() {
  window.speechSynthesis?.cancel()
}

export async function speakLines(lines: string[], settings: VoiceSettings) {
  if (!settings.enabled || !('speechSynthesis' in window)) return

  for (const line of lines) {
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(line)
      utterance.lang = 'zh-CN'
      utterance.rate = settings.rate
      utterance.pitch = 0.88
      utterance.volume = 1
      const voice = chineseVoice()
      if (voice) utterance.voice = voice
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
    await pause(460)
  }
}

export { pause }

