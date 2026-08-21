export type Phase =
  | 'START'
  | 'DAWN_PHASE'
  | 'WITCH_BLACK_CAT_ACTION'
  | 'DAY_START'
  | 'NIGHT_PHASE'
  | 'WITCH_KILL_ACTION'
  | 'SHERIFF_PROTECT_ACTION'
  | 'RESULTS_READY'
  | 'RESULTS_REVEALED'
  | 'GAME_COMPLETE'

export interface Player {
  id: number
  name: string
}

export interface GameState {
  players: Player[]
  phase: Phase
  nightNumber: number
  blackCatTarget: number | null
  witchKillTarget: number | null
  sheriffProtectTarget: number | null
  sheriffEnabled: boolean
  history: NightRecord[]
}

export interface NightRecord {
  nightNumber: number
  witchKillTarget: number
  sheriffProtectTarget: number | null
  sheriffEnabled: boolean
}

export interface VoiceSettings {
  enabled: boolean
  rate: number
  bgmVolume: number
}

