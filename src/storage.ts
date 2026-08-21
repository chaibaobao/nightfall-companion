import type { GameState, VoiceSettings } from './types'

const GAME_KEY = 'nightfall-companion:game'
const VOICE_KEY = 'nightfall-companion:voice'

export const initialGame: GameState = {
  players: [],
  phase: 'START',
  nightNumber: 1,
  blackCatTarget: null,
  witchKillTarget: null,
  sheriffProtectTarget: null,
}

export const initialVoice: VoiceSettings = { enabled: true, rate: 0.82 }

export function loadGame(): GameState {
  try {
    const saved = localStorage.getItem(GAME_KEY)
    return saved ? { ...initialGame, ...JSON.parse(saved) } : initialGame
  } catch {
    return initialGame
  }
}

export function saveGame(game: GameState) {
  localStorage.setItem(GAME_KEY, JSON.stringify(game))
}

export function clearGame() {
  localStorage.removeItem(GAME_KEY)
}

export function loadVoice(): VoiceSettings {
  try {
    const saved = localStorage.getItem(VOICE_KEY)
    return saved ? { ...initialVoice, ...JSON.parse(saved) } : initialVoice
  } catch {
    return initialVoice
  }
}

export function saveVoice(settings: VoiceSettings) {
  localStorage.setItem(VOICE_KEY, JSON.stringify(settings))
}

