import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Moon, Music, Settings, Shield, Sparkles, Upload, Volume2, VolumeX, X } from 'lucide-react'
import { clearGame, initialGame, loadGame, loadVoice, saveGame, saveVoice } from './storage'
import { getAudioAssetNames, NARRATION_LINES, prepareBuiltInBgm, removeAudioAsset, saveAudioAsset, speakLines, stopSpeech, withBackgroundMusic } from './speech'
import type { GameState, Phase, Player, VoiceSettings } from './types'

const line = (id: string) => NARRATION_LINES.find((item) => item.id === id)!
const phaseCopy: Record<Phase, { eyebrow: string; title: string; prompt: string }> = {
  START: { eyebrow: '新游戏', title: '猎巫镇', prompt: '设置围坐于桌边的玩家' },
  DAWN_PHASE: { eyebrow: '黎明阶段', title: '所有人闭眼', prompt: '请聆听主持引导' },
  WITCH_BLACK_CAT_ACTION: { eyebrow: '黎明阶段 · 女巫行动', title: '放置黑猫', prompt: '请选择一名玩家' },
  DAY_START: { eyebrow: '黎明', title: '天亮了', prompt: '准备进入第一个夜晚' },
  NIGHT_PHASE: { eyebrow: '夜晚阶段', title: '夜晚降临', prompt: '所有人闭眼，请聆听主持引导' },
  WITCH_KILL_ACTION: { eyebrow: '夜晚阶段 · 女巫行动', title: '选择谋杀对象', prompt: '请选择一名玩家' },
  SHERIFF_PROTECT_ACTION: { eyebrow: '夜晚阶段 · 警长行动', title: '选择保护对象', prompt: '请遵守规则，不要保护自己' },
  RESULTS_READY: { eyebrow: '黎明', title: '夜晚行动完成', prompt: '所有选择均已封存' },
  RESULTS_REVEALED: { eyebrow: '行动记录', title: '昨夜结果', prompt: '公布本轮隐藏选择' },
  GAME_COMPLETE: { eyebrow: '游戏结束', title: '夜幕散去', prompt: '本局主持流程已经完成' },
}

function makePlayers(count: number, existing: Player[]) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, name: existing[index]?.name ?? `玩家${String.fromCharCode(65 + index)}` }))
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => loadGame())
  const [voice, setVoice] = useState<VoiceSettings>(() => loadVoice())
  const [draftPlayers, setDraftPlayers] = useState<Player[]>(() => loadGame().players.length ? loadGame().players : makePlayers(6, []))
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioNames, setAudioNames] = useState<Record<string, string>>(() => getAudioAssetNames())
  const [audioMessage, setAudioMessage] = useState('')
  const [blackCatRevealed, setBlackCatRevealed] = useState(false)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopSpeech() } }, [])
  useEffect(() => { void prepareBuiltInBgm() }, [])
  useEffect(() => saveGame(game), [game])
  useEffect(() => saveVoice(voice), [voice])

  const copy = phaseCopy[game.phase]
  const isAction = ['WITCH_BLACK_CAT_ACTION', 'WITCH_KILL_ACTION', 'SHERIFF_PROTECT_ACTION'].includes(game.phase)
  const playerName = useMemo(() => (id: number | null) => game.players.find((p) => p.id === id)?.name ?? '无', [game.players])
  const changePhase = (phase: Phase) => mounted.current && setGame((current) => ({ ...current, phase }))
  const scene = async (action: () => Promise<void>) => withBackgroundMusic(voice, action)
  const say = (ids: string[]) => speakLines(ids.map(line), voice)

  const beginGame = async () => {
    if (draftPlayers.some((player) => !player.name.trim())) return
    stopSpeech(); setBusy(true)
    setBlackCatRevealed(false)
    setGame({ ...initialGame, players: draftPlayers.map((p) => ({ ...p, name: p.name.trim() })), phase: 'DAWN_PHASE' })
    await scene(() => say(['dawn-intro']))
    changePhase('WITCH_BLACK_CAT_ACTION'); if (mounted.current) setBusy(false)
  }

  const beginNight = async () => {
    stopSpeech(); setBusy(true)
    const nextNumber = game.phase === 'RESULTS_REVEALED' ? game.nightNumber + 1 : game.nightNumber
    setGame((current) => ({ ...current, nightNumber: nextNumber, witchKillTarget: null, sheriffProtectTarget: null, phase: 'NIGHT_PHASE' }))
    await scene(() => say(['night-intro']))
    changePhase('WITCH_KILL_ACTION'); if (mounted.current) setBusy(false)
  }

  const finishNight = (witchTarget: number, sheriffTarget: number | null) => {
    setGame((current) => ({ ...current, witchKillTarget: witchTarget, sheriffProtectTarget: sheriffTarget, phase: 'RESULTS_READY', history: [...current.history, { nightNumber: current.nightNumber, witchKillTarget: witchTarget, sheriffProtectTarget: sheriffTarget, sheriffEnabled: current.sheriffEnabled }] }))
  }

  const selectPlayer = async (id: number) => {
    if (busy) return
    setBusy(true)
    if (game.phase === 'WITCH_BLACK_CAT_ACTION') {
      setGame((current) => ({ ...current, blackCatTarget: id, phase: 'DAWN_PHASE' }))
      await scene(() => say(['dawn-complete']))
      changePhase('DAY_START')
    } else if (game.phase === 'WITCH_KILL_ACTION') {
      setGame((current) => ({ ...current, witchKillTarget: id, phase: 'NIGHT_PHASE' }))
      await scene(() => say([game.sheriffEnabled ? 'witch-complete-sheriff' : 'witch-complete-no-sheriff']))
      if (game.sheriffEnabled) changePhase('SHERIFF_PROTECT_ACTION'); else finishNight(id, null)
    } else if (game.phase === 'SHERIFF_PROTECT_ACTION') {
      setGame((current) => ({ ...current, sheriffProtectTarget: id, phase: 'NIGHT_PHASE' }))
      await scene(() => say(['sheriff-complete']))
      finishNight(game.witchKillTarget!, id)
    }
    if (mounted.current) setBusy(false)
  }

  const revealResults = () => changePhase('RESULTS_REVEALED')
  const reset = () => { stopSpeech(); clearGame(); setGame(initialGame); setDraftPlayers(makePlayers(6, [])); setBlackCatRevealed(false); setBusy(false); setSettingsOpen(false) }
  const replayPrompt = async () => {
    const ids: Partial<Record<Phase, string[]>> = { WITCH_BLACK_CAT_ACTION: ['dawn-intro'], WITCH_KILL_ACTION: ['night-intro'], SHERIFF_PROTECT_ACTION: ['witch-complete-sheriff'] }
    if (ids[game.phase]) await scene(() => say(ids[game.phase]!))
  }
  const uploadAudio = async (id: string, file?: File) => {
    if (!file) return
    try { setAudioMessage('正在保存…'); setAudioNames(await saveAudioAsset(id, file)); setAudioMessage('已保存到本机，可离线使用') }
    catch (error) { setAudioMessage(error instanceof Error ? error.message : '音频保存失败') }
  }

  const icon = game.phase === 'SHERIFF_PROTECT_ACTION' ? <Shield /> : game.phase === 'RESULTS_REVEALED' ? <Eye /> : ['DAY_START', 'RESULTS_READY', 'GAME_COMPLETE'].includes(game.phase) ? <Sparkles /> : <Moon />
  const nightChoice = <div className="night-choice"><label className="toggle-row inline-toggle"><span><Shield /><i><strong>本轮播报警长</strong><small>警长能力失效时关闭</small></i></span><input type="checkbox" checked={game.sheriffEnabled} onChange={(e) => setGame((current) => ({ ...current, sheriffEnabled: e.target.checked }))} /></label><button className="primary-button compact" onClick={beginNight}>{game.phase === 'RESULTS_REVEALED' ? '进入下一夜' : '进入夜晚'}</button><button className="secondary-button" onClick={() => changePhase('GAME_COMPLETE')}>结束游戏</button></div>

  return <main className="app-shell">
    <div className="ambient" aria-hidden="true" />
    <header className="topbar"><div><span className="brand-mark" aria-hidden="true">N</span><div className="brand-copy"><strong>Nightfall Companion</strong><span>Night {String(game.nightNumber).padStart(2, '0')}</span></div></div><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置"><Settings size={19} /></button></header>
    <section className={`stage ${game.phase === 'START' ? 'stage-setup' : ''}`} key={game.phase}>
      <div className="phase-symbol" aria-hidden="true">{icon}</div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="prompt">{copy.prompt}</p>
      {game.phase === 'START' && <div className="setup-panel"><label className="count-row"><span>玩家数量</span><select value={draftPlayers.length} onChange={(e) => setDraftPlayers(makePlayers(Number(e.target.value), draftPlayers))}>{Array.from({ length: 14 }, (_, i) => i + 3).map((count) => <option value={count} key={count}>{count} 人</option>)}</select></label><div className="name-list">{draftPlayers.map((player, index) => <label className="name-field" key={player.id}><span>{String(player.id).padStart(2, '0')}</span><input value={player.name} maxLength={12} aria-label={`玩家 ${player.id} 姓名`} onChange={(e) => { const next = [...draftPlayers]; next[index] = { ...player, name: e.target.value }; setDraftPlayers(next) }} /></label>)}</div><button className="primary-button" onClick={beginGame} disabled={draftPlayers.some((p) => !p.name.trim())}>开始游戏</button><p className="privacy-note">玩家身份不会被记录 · 所有数据仅保存在本机</p></div>}
      {isAction && <div className="action-area"><div className="instruction"><EyeOff size={15} /> 点击后立即封存，不会显示选择结果</div><div className="player-grid">{game.players.map((player) => <button className="player-card" key={player.id} onClick={() => selectPlayer(player.id)} disabled={busy}><span>{String(player.id).padStart(2, '0')}</span><strong>{player.name}</strong><i aria-hidden="true" /></button>)}</div><button className="text-button" onClick={replayPrompt} disabled={busy || !voice.enabled}><Volume2 size={15} /> 重播提示</button></div>}
      {busy && game.phase !== 'START' && !isAction && <div className="listening"><span /><p>请聆听主持引导</p></div>}
      {game.phase === 'DAY_START' && <><div className={`black-cat-reveal ${blackCatRevealed ? 'is-revealed' : ''}`}><span>黎明记录</span>{blackCatRevealed ? <><small>黑猫被放置在</small><strong>{playerName(game.blackCatTarget)}</strong><button className="text-button" onClick={() => setBlackCatRevealed(false)}><EyeOff size={15} /> 隐藏黑猫位置</button></> : <><EyeOff size={25} /><small>黑猫位置仍处于隐藏状态</small><button className="secondary-button" onClick={() => setBlackCatRevealed(true)}><Eye size={16} /> 揭示黑猫</button></>}</div>{nightChoice}</>}
      {game.phase === 'RESULTS_READY' && <div className="sealed-card"><EyeOff size={25} /><p>结果仍处于隐藏状态</p><button className="primary-button compact" onClick={revealResults} disabled={busy}>展示结果</button></div>}
      {game.phase === 'RESULTS_REVEALED' && <><div className="results"><div><span>被谋杀</span><strong>{playerName(game.witchKillTarget)}</strong></div><div><span>被保护</span><strong>{game.sheriffEnabled ? playerName(game.sheriffProtectTarget) : '本轮无警长'}</strong></div><div><span>黑猫位置</span><strong>{playerName(game.blackCatTarget)}</strong></div></div>{nightChoice}</>}
      {game.phase === 'GAME_COMPLETE' && <div className="sealed-card complete-card"><Check size={26} /><p>共完成 {game.history.length} 个夜晚阶段</p><button className="primary-button compact" onClick={reset}>开始新游戏</button></div>}
    </section>
    {settingsOpen && <div className="sheet-backdrop" onClick={() => setSettingsOpen(false)}><aside className="settings-sheet" onClick={(e) => e.stopPropagation()}><div className="sheet-handle" /><div className="sheet-title"><div><span>偏好设置</span><strong>声音与主持</strong></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X size={20} /></button></div><div className="settings-scroll">
      <label className="toggle-row"><span>{voice.enabled ? <Volume2 /> : <VolumeX />}<i><strong>自动语音主持</strong><small>自定义音频优先，未上传时使用中文朗读</small></i></span><input type="checkbox" checked={voice.enabled} onChange={(e) => { stopSpeech(); setVoice({ ...voice, enabled: e.target.checked }) }} /></label>
      <label className="rate-control"><span><strong>自动朗读语速</strong><output>{voice.rate.toFixed(2)}×</output></span><input type="range" min="0.65" max="1.1" step="0.05" value={voice.rate} onChange={(e) => setVoice({ ...voice, rate: Number(e.target.value) })} /><small><span>舒缓</span><span>自然</span></small></label>
      <label className="rate-control"><span><strong>BGM 音量</strong><output>{Math.round(voice.bgmVolume * 100)}%</output></span><input type="range" min="0.05" max="0.5" step="0.05" value={voice.bgmVolume} onChange={(e) => setVoice({ ...voice, bgmVolume: Number(e.target.value) })} /></label>
      <details className="audio-library"><summary><span><Music size={17} /> 自定义主持音频</span><small>6 段语音</small></summary><p>本机上传优先于 GitHub 内置语音；未配置时使用中文自动朗读。</p><AudioUploadRow id="bgm" label="播报背景音乐（循环）" sublabel="已内置默认音乐，本机上传将优先覆盖" filename={audioNames.bgm} onUpload={uploadAudio} onRemove={async (id) => setAudioNames(await removeAudioAsset(id))} />{NARRATION_LINES.map((item) => <AudioUploadRow key={item.id} id={item.id} label={item.label} sublabel={item.text} filename={audioNames[item.id]} onUpload={uploadAudio} onRemove={async (id) => setAudioNames(await removeAudioAsset(id))} />)}</details>
      {audioMessage && <p className="audio-message">{audioMessage}</p>}{game.phase !== 'START' && <button className="danger-button" onClick={reset}>结束并清除本局</button>}
    </div></aside></div>}
  </main>
}

function AudioUploadRow({ id, label, sublabel, filename, onUpload, onRemove }: { id: string; label: string; sublabel?: string; filename?: string; onUpload: (id: string, file?: File) => void; onRemove: (id: string) => void }) {
  return <div className="audio-row"><div><strong>{label}</strong>{sublabel && <small>{sublabel}</small>}{filename && <em>{filename}</em>}</div><div>{filename && <button onClick={() => onRemove(id)} aria-label={`移除${label}`}><X size={14} /></button>}<label><Upload size={14} /><input type="file" accept="audio/*" onChange={(e) => { onUpload(id, e.target.files?.[0]); e.target.value = '' }} /><span>{filename ? '替换' : '上传'}</span></label></div></div>
}

