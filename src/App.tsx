import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, Moon, RotateCcw, Settings, Shield, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { clearGame, initialGame, loadGame, loadVoice, saveGame, saveVoice } from './storage'
import { pause, speakLines, stopSpeech } from './speech'
import type { GameState, Phase, Player, VoiceSettings } from './types'

const phaseCopy: Record<Phase, { eyebrow: string; title: string; prompt: string }> = {
  START: { eyebrow: '新游戏', title: '猎巫镇', prompt: '设置围坐于桌边的玩家' },
  DAWN_PHASE: { eyebrow: '黎明阶段', title: '所有人闭眼', prompt: '请聆听主持引导' },
  WITCH_BLACK_CAT_ACTION: { eyebrow: '黎明阶段 · 女巫行动', title: '放置黑猫', prompt: '请选择一名玩家' },
  DAY_START: { eyebrow: '黎明', title: '天亮了', prompt: '黑猫已经悄然找到归宿' },
  NIGHT_PHASE: { eyebrow: '夜晚阶段', title: '夜晚降临', prompt: '所有人闭眼，请聆听主持引导' },
  WITCH_KILL_ACTION: { eyebrow: '夜晚阶段 · 女巫行动', title: '选择谋杀对象', prompt: '请选择一名玩家' },
  SHERIFF_PROTECT_ACTION: { eyebrow: '夜晚阶段 · 警长行动', title: '选择保护对象', prompt: '请遵守规则，不要保护自己' },
  RESULTS_READY: { eyebrow: '黎明', title: '夜晚行动完成', prompt: '所有选择均已封存' },
  RESULTS_REVEALED: { eyebrow: '行动记录', title: '昨夜结果', prompt: '公布本轮隐藏选择' },
}

function makePlayers(count: number, existing: Player[]) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: existing[index]?.name ?? `玩家${String.fromCharCode(65 + index)}`,
  }))
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadGame())
  const [voice, setVoice] = useState<VoiceSettings>(() => loadVoice())
  const [draftPlayers, setDraftPlayers] = useState<Player[]>(() => {
    const saved = loadGame().players
    return saved.length ? saved : makePlayers(6, [])
  })
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const mounted = useRef(true)

  useEffect(() => () => {
    mounted.current = false
    stopSpeech()
  }, [])

  useEffect(() => saveGame(game), [game])
  useEffect(() => saveVoice(voice), [voice])

  const copy = phaseCopy[game.phase]
  const isAction = ['WITCH_BLACK_CAT_ACTION', 'WITCH_KILL_ACTION', 'SHERIFF_PROTECT_ACTION'].includes(game.phase)
  const playerName = useMemo(() => (id: number | null) => game.players.find((p) => p.id === id)?.name ?? '未选择', [game.players])

  const changePhase = (phase: Phase) => {
    if (mounted.current) setGame((current) => ({ ...current, phase }))
  }

  const narrate = async (lines: string[], waitAfter = 0) => {
    await speakLines(lines, voice)
    if (waitAfter) await pause(waitAfter)
  }

  const beginGame = async () => {
    if (draftPlayers.some((player) => !player.name.trim())) return
    stopSpeech()
    setBusy(true)
    const fresh: GameState = { ...initialGame, players: draftPlayers.map((p) => ({ ...p, name: p.name.trim() })), phase: 'DAWN_PHASE' }
    setGame(fresh)
    // A short utterance in this direct click handler unlocks speech on restrictive mobile browsers.
    await narrate(['黎明阶段开始。', '所有人闭眼。'], 3000)
    await narrate(['女巫请睁眼。', '请选择放置黑猫的对象。', '女巫可以选择任意玩家，包括自己。'])
    changePhase('WITCH_BLACK_CAT_ACTION')
    if (mounted.current) setBusy(false)
  }

  const beginNight = async () => {
    stopSpeech()
    setBusy(true)
    changePhase('NIGHT_PHASE')
    await narrate(['夜晚降临。', '所有人闭眼。'], 3000)
    await narrate(['女巫请睁眼。', '请选择今晚要谋杀的对象。', '女巫可以选择任意玩家，包括自己。'])
    changePhase('WITCH_KILL_ACTION')
    if (mounted.current) setBusy(false)
  }

  const selectPlayer = async (id: number) => {
    if (busy) return
    setBusy(true)
    if (game.phase === 'WITCH_BLACK_CAT_ACTION') {
      setGame((current) => ({ ...current, blackCatTarget: id, phase: 'DAWN_PHASE' }))
      await narrate(['黑猫已放置。', '女巫请闭眼。'], 3000)
      await narrate(['天亮了。'])
      changePhase('DAY_START')
    } else if (game.phase === 'WITCH_KILL_ACTION') {
      setGame((current) => ({ ...current, witchKillTarget: id, phase: 'NIGHT_PHASE' }))
      await narrate(['对象已选择。', '女巫请闭眼。'], 3000)
      await narrate(['警长请睁眼。', '请选择需要保护的对象。', '警长不能保护自己。'])
      changePhase('SHERIFF_PROTECT_ACTION')
    } else if (game.phase === 'SHERIFF_PROTECT_ACTION') {
      setGame((current) => ({ ...current, sheriffProtectTarget: id, phase: 'NIGHT_PHASE' }))
      await narrate(['对象已选择。', '警长请闭眼。'], 3000)
      await narrate(['天亮了。'])
      changePhase('RESULTS_READY')
    }
    if (mounted.current) setBusy(false)
  }

  const revealResults = async () => {
    setBusy(true)
    await narrate(['昨夜行动结果如下。'])
    changePhase('RESULTS_REVEALED')
    if (mounted.current) setBusy(false)
  }

  const reset = () => {
    stopSpeech()
    clearGame()
    setGame(initialGame)
    setDraftPlayers(makePlayers(6, []))
    setBusy(false)
    setSettingsOpen(false)
  }

  const replayPrompt = async () => {
    const lines: Partial<Record<Phase, string[]>> = {
      WITCH_BLACK_CAT_ACTION: ['请选择放置黑猫的对象。', '女巫可以选择任意玩家，包括自己。'],
      WITCH_KILL_ACTION: ['请选择今晚要谋杀的对象。', '女巫可以选择任意玩家，包括自己。'],
      SHERIFF_PROTECT_ACTION: ['请选择需要保护的对象。', '警长不能保护自己。'],
    }
    const current = lines[game.phase]
    if (current) await narrate(current)
  }

  const icon = game.phase === 'SHERIFF_PROTECT_ACTION' ? <Shield /> : game.phase === 'RESULTS_REVEALED' ? <Eye /> : game.phase === 'DAY_START' || game.phase === 'RESULTS_READY' ? <Sparkles /> : <Moon />

  return (
    <main className="app-shell">
      <div className="ambient" aria-hidden="true" />
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">N</span>
          <div className="brand-copy">
            <strong>Nightfall Companion</strong>
            <span>Night {String(game.nightNumber).padStart(2, '0')}</span>
          </div>
        </div>
        <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置"><Settings size={19} /></button>
      </header>

      <section className={`stage ${game.phase === 'START' ? 'stage-setup' : ''}`} key={game.phase}>
        <div className="phase-symbol" aria-hidden="true">{icon}</div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="prompt">{copy.prompt}</p>

        {game.phase === 'START' && (
          <div className="setup-panel">
            <label className="count-row">
              <span>玩家数量</span>
              <select value={draftPlayers.length} onChange={(event) => setDraftPlayers(makePlayers(Number(event.target.value), draftPlayers))}>
                {Array.from({ length: 14 }, (_, i) => i + 3).map((count) => <option value={count} key={count}>{count} 人</option>)}
              </select>
            </label>
            <div className="name-list">
              {draftPlayers.map((player, index) => (
                <label className="name-field" key={player.id}>
                  <span>{String(player.id).padStart(2, '0')}</span>
                  <input value={player.name} maxLength={12} aria-label={`玩家 ${player.id} 姓名`} onChange={(event) => {
                    const next = [...draftPlayers]
                    next[index] = { ...player, name: event.target.value }
                    setDraftPlayers(next)
                  }} />
                </label>
              ))}
            </div>
            <button className="primary-button" onClick={beginGame} disabled={draftPlayers.some((p) => !p.name.trim())}>开始游戏</button>
            <p className="privacy-note">玩家身份不会被记录 · 所有数据仅保存在本机</p>
          </div>
        )}

        {isAction && (
          <div className="action-area">
            <div className="instruction"><EyeOff size={15} /> 点击后立即封存，不会显示选择结果</div>
            <div className="player-grid">
              {game.players.map((player) => (
                <button className="player-card" key={player.id} onClick={() => selectPlayer(player.id)} disabled={busy}>
                  <span>{String(player.id).padStart(2, '0')}</span>
                  <strong>{player.name}</strong>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="text-button" onClick={replayPrompt} disabled={busy || !voice.enabled}><Volume2 size={15} /> 重播提示</button>
          </div>
        )}

        {busy && game.phase !== 'START' && !isAction && (
          <div className="listening"><span /><p>请聆听主持引导</p></div>
        )}

        {game.phase === 'DAY_START' && <button className="primary-button compact" onClick={beginNight}>进入夜晚</button>}

        {game.phase === 'RESULTS_READY' && (
          <div className="sealed-card">
            <EyeOff size={25} />
            <p>结果仍处于隐藏状态</p>
            <button className="primary-button compact" onClick={revealResults} disabled={busy}>展示结果</button>
          </div>
        )}

        {game.phase === 'RESULTS_REVEALED' && (
          <div className="results">
            <div><span>被谋杀</span><strong>{playerName(game.witchKillTarget)}</strong></div>
            <div><span>被保护</span><strong>{playerName(game.sheriffProtectTarget)}</strong></div>
            <div><span>黑猫位置</span><strong>{playerName(game.blackCatTarget)}</strong></div>
            <button className="secondary-button" onClick={reset}><RotateCcw size={16} /> 开始新游戏</button>
          </div>
        )}
      </section>

      {settingsOpen && (
        <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <aside className="settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title"><div><span>偏好设置</span><strong>主持声音</strong></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X size={20} /></button></div>
            <label className="toggle-row">
              <span>{voice.enabled ? <Volume2 /> : <VolumeX />}<i><strong>自动语音主持</strong><small>使用设备内置中文语音</small></i></span>
              <input type="checkbox" checked={voice.enabled} onChange={(event) => { stopSpeech(); setVoice({ ...voice, enabled: event.target.checked }) }} />
            </label>
            <label className="rate-control">
              <span><strong>语速</strong><output>{voice.rate.toFixed(2)}×</output></span>
              <input type="range" min="0.65" max="1.1" step="0.05" value={voice.rate} onChange={(event) => setVoice({ ...voice, rate: Number(event.target.value) })} />
              <small><span>舒缓</span><span>自然</span></small>
            </label>
            {game.phase !== 'START' && <button className="danger-button" onClick={reset}>结束并清除本局</button>}
          </aside>
        </div>
      )}
    </main>
  )
}

