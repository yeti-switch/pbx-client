import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Phone,
  Palette,
  Info,
  Network,
  Volume2,
  Mic,
  Play,
  Square
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useThemeStore, type Theme } from '@/lib/theme'
import { useConfigStore } from '@/softphone/configStore'
import { useAudioDevicesStore } from '@/softphone/audioDevicesStore'
import { useSoftphoneStore } from '@/softphone/store'
import { RINGTONES, playRingtone, type RingtoneHandle } from '@/softphone/ringtones'
import PermissionsPanel from './PermissionsPanel'
import type { AppInfo } from '@shared/ipc'

type SectionId = 'sip' | 'webrtc' | 'audio' | 'appearance' | 'about'

const SECTIONS: { id: SectionId; label: string; icon: typeof Phone }[] = [
  { id: 'sip', label: 'SIP Settings', icon: Phone },
  { id: 'webrtc', label: 'WebRTC', icon: Network },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'about', label: 'About', icon: Info }
]

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary'

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function SettingsPage(): React.JSX.Element {
  const config = useConfigStore()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const audio = useAudioDevicesStore()
  const applyInput = useSoftphoneStore((s) => s.applyInputDeviceToActiveCalls)
  const applyOutput = useSoftphoneStore((s) => s.applyOutputDeviceToActiveCalls)

  const [section, setSection] = useState<SectionId>('sip')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [endpoints, setEndpoints] = useState('')
  const [iceServers, setIceServers] = useState('')
  const [iceSrflxOnly, setIceSrflxOnly] = useState(false)
  const [webrtcFieldTrials, setWebrtcFieldTrials] = useState('')
  const [ringtone, setRingtone] = useState('classic')
  const [previewing, setPreviewing] = useState(false)
  const previewRef = useRef<RingtoneHandle | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [configPath, setConfigPath] = useState('')
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  // Resolve the on-disk config file path and app/runtime info (from main).
  useEffect(() => {
    void window.api.config.path().then(setConfigPath)
    void window.api.app.info().then(setAppInfo)
  }, [])

  // Load current config into the form once it's available.
  useEffect(() => {
    if (!config.loaded) {
      void config.load()
      return
    }
    setUsername(config.username)
    setPassword(config.password)
    setDomain(config.domain)
    setInstanceId(config.instanceId)
    setEndpoints(config.wssEndpoints.join('\n'))
    setIceServers(
      config.iceServers.map((s) => (Array.isArray(s.urls) ? s.urls.join(' ') : s.urls)).join('\n')
    )
    setIceSrflxOnly(config.iceSrflxOnly)
    setWebrtcFieldTrials(config.webrtcFieldTrials)
    setRingtone(config.ringtone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.loaded])

  // Stop any ringtone preview when leaving the Audio section or unmounting.
  const stopPreview = (): void => {
    previewRef.current?.stop()
    previewRef.current = null
    setPreviewing(false)
  }
  useEffect(() => {
    if (section === 'audio') void audio.enumerate()
    if (section !== 'audio') stopPreview()
    return stopPreview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  const togglePreview = (): void => {
    if (previewing) {
      stopPreview()
      return
    }
    previewRef.current = playRingtone(ringtone)
    setPreviewing(true)
  }

  const save = async (): Promise<void> => {
    await config.save({
      username: username.trim(),
      password,
      domain: domain.trim(),
      instanceId: instanceId.trim(),
      wssEndpoints: linesToList(endpoints),
      iceServers: linesToList(iceServers).map((urls) => ({ urls })),
      iceSrflxOnly,
      webrtcFieldTrials: webrtcFieldTrials.trim(),
      ringtone
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Settings group list */}
      <nav className="w-48 shrink-0 border-r border-border p-3">
        <ul className="flex flex-col gap-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                  onClick={() => setSection(s.id)}
                >
                  <Icon className="size-4 shrink-0" />
                  {s.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Group content */}
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {section === 'appearance' && (
          <Card className="max-w-xl">
            <CardContent>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Theme</label>
                <div className="inline-flex w-fit rounded-lg border border-border p-0.5">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const active = theme === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => setTheme(opt.value)}
                      >
                        <Icon className="size-4" />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  &ldquo;System&rdquo; follows your OS light/dark setting.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'sip' && (
          <Card className="max-w-xl">
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Username</label>
                <input
                  className={inputClass}
                  value={username}
                  autoComplete="off"
                  placeholder="e.g. 1001"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <input
                    className={`${inputClass} pr-10`}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    autoComplete="off"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">SIP domain</label>
                <input
                  className={inputClass}
                  value={domain}
                  autoComplete="off"
                  placeholder="e.g. phone.systems"
                  onChange={(e) => setDomain(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Domain used in REGISTER/INVITE request-URIs (sip:user@domain). Leave blank to use
                  the wss endpoint host.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">WSS endpoints</label>
                <textarea
                  className={`${inputClass} min-h-20 font-mono`}
                  value={endpoints}
                  placeholder={'wss://sip.example.com\nwss://sip2.example.com'}
                  spellCheck={false}
                  onChange={(e) => setEndpoints(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">One endpoint per line.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Instance ID</label>
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputClass} font-mono`}
                    value={instanceId}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="generated automatically"
                    onChange={(e) => setInstanceId(e.target.value)}
                  />
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
                    title="Generate a new instance ID"
                    onClick={() => setInstanceId(crypto.randomUUID())}
                  >
                    <RefreshCw className="size-4" />
                    Regenerate
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  RFC 5626 +sip.instance UUID. Generated on first run and kept stable; regenerate or
                  paste a provider-supplied value.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={save}
                >
                  Save
                </button>
                {saved && (
                  <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <Check className="size-4" />
                    Saved
                  </span>
                )}
              </div>

              {configPath && (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Stored at <span className="font-mono break-all">{configPath}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {section === 'webrtc' && (
          <Card className="max-w-xl">
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ICE servers (optional)</label>
                <textarea
                  className={`${inputClass} min-h-16 font-mono`}
                  value={iceServers}
                  placeholder={'stun:stun.l.google.com:19302'}
                  spellCheck={false}
                  onChange={(e) => setIceServers(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">One URL per line.</p>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={iceSrflxOnly}
                  onChange={(e) => setIceSrflxOnly(e.target.checked)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">ICE srflx only</span>
                  <span className="text-xs text-muted-foreground">
                    Send only server-reflexive (public) ICE candidates — strip host and relay
                    candidates from offers/answers. Reduces SDP/ICE noise on multi-interface
                    machines. Requires a working STUN server; if no srflx is gathered, calls can
                    fail.
                  </span>
                </span>
              </label>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <label className="text-sm font-medium">ICE field trials (advanced)</label>
                <input
                  className={`${inputClass} font-mono`}
                  value={webrtcFieldTrials}
                  placeholder="WebRTC-IceFieldTrials/initial_select_dampening:100/"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setWebrtcFieldTrials(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Passed to Chromium&rsquo;s <span className="font-mono">--force-fieldtrials</span>{' '}
                  at startup to tune the ICE agent (e.g. check pacing). Expert-only and
                  version-dependent; applied process-wide and only takes effect after an{' '}
                  <strong>app restart</strong>.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={save}
                >
                  Save
                </button>
                {saved && (
                  <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <Check className="size-4" />
                    Saved
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'audio' && (
          <Card className="max-w-xl">
            <CardContent className="flex flex-col gap-4">
              {/* Microphone */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Mic className="size-3.5 text-muted-foreground" />
                  Microphone
                </label>
                <select
                  className={inputClass}
                  value={audio.selectedInputId}
                  onChange={(e) => {
                    audio.selectInput(e.target.value)
                    applyInput()
                  }}
                >
                  {audio.inputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {audio.inputs.length === 0 && (
                    <option value="default" disabled>
                      No devices found
                    </option>
                  )}
                </select>
              </div>

              {/* Speaker */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="size-3.5 text-muted-foreground" />
                  Speaker
                  {!audio.sinkIdSupported && (
                    <span className="text-xs font-normal text-muted-foreground">
                      (not supported)
                    </span>
                  )}
                </label>
                <select
                  className={`${inputClass} disabled:opacity-50`}
                  value={audio.selectedOutputId}
                  disabled={!audio.sinkIdSupported}
                  onChange={(e) => {
                    audio.selectOutput(e.target.value)
                    applyOutput()
                  }}
                >
                  {audio.outputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                  {audio.outputs.length === 0 && (
                    <option value="default" disabled>
                      No devices found
                    </option>
                  )}
                </select>
              </div>

              {audio.inputs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Grant microphone permission first to see device names.
                </p>
              )}

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <label className="text-sm font-medium">Incoming-call ringtone</label>
                <div className="flex items-center gap-2">
                  <select
                    className={`${inputClass} flex-1`}
                    value={ringtone}
                    onChange={(e) => {
                      stopPreview()
                      setRingtone(e.target.value)
                    }}
                  >
                    {RINGTONES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                    onClick={togglePreview}
                    title={previewing ? 'Stop' : 'Play ringtone'}
                  >
                    {previewing ? (
                      <>
                        <Square className="size-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="size-4" />
                        Test
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Plays through the selected audio output device when a call comes in.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <label className="text-sm font-medium">Permissions</label>
                <PermissionsPanel />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={save}
                >
                  Save
                </button>
                {saved && (
                  <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <Check className="size-4" />
                    Saved
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {section === 'about' && (
          <Card className="max-w-xl">
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-green-600 text-white">
                  <Phone className="size-6" />
                </div>
                <div>
                  <p className="text-base font-semibold">PBX Client</p>
                  <p className="text-sm text-muted-foreground">Version {appInfo?.version ?? '…'}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
                <dt className="text-muted-foreground">Electron</dt>
                <dd className="font-mono">{appInfo?.electron ?? '…'}</dd>
                <dt className="text-muted-foreground">Chromium</dt>
                <dd className="font-mono">{appInfo?.chrome ?? '…'}</dd>
                <dt className="text-muted-foreground">Node</dt>
                <dd className="font-mono">{appInfo?.node ?? '…'}</dd>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default SettingsPage
