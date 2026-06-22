import { app, shell, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  IPC,
  DEFAULT_SIP_CONFIG,
  type AppStatus,
  type IncomingCallPayload,
  type SipConfig
} from '../shared/ipc'

// SIP config persisted as JSON under the OS user-data directory.
const configPath = (): string => join(app.getPath('userData'), 'sip-config.json')

// Apply Chromium WebRTC field trials from the persisted config BEFORE the app
// starts (command-line switches must be set this early). Global + restart-only.
;(() => {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as Partial<SipConfig>
    const trials = raw.webrtcFieldTrials?.trim()
    if (trials) {
      app.commandLine.appendSwitch('force-fieldtrials', trials)
      console.log('Applied --force-fieldtrials:', trials)
    }
  } catch {
    // no config yet / unreadable — skip
  }
})()

let sipConfig: SipConfig = { ...DEFAULT_SIP_CONFIG }

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let status: AppStatus = { registered: false, inCall: false, incoming: false, detail: 'Starting…' }
// Active incoming-call notifications, keyed by call id, so they can be dismissed.
const incomingNotifications = new Map<string, Notification>()

function persistConfig(): void {
  try {
    writeFileSync(configPath(), JSON.stringify(sipConfig, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to persist SIP config:', err)
  }
}

function loadConfig(): void {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as Partial<SipConfig>
    sipConfig = { ...DEFAULT_SIP_CONFIG, ...raw }
  } catch {
    // no config file yet — keep defaults
  }
  // Generate a stable instance id on first run and persist it.
  if (!sipConfig.instanceId) {
    sipConfig.instanceId = randomUUID()
    persistConfig()
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.moveTop()
  // Briefly force always-on-top so the window reliably raises above other apps
  // (some window managers otherwise suppress focus-stealing).
  mainWindow.setAlwaysOnTop(true)
  setTimeout(() => mainWindow?.setAlwaysOnTop(false), 800)
}

function toggleMainWindow(): void {
  if (mainWindow?.isVisible() && !mainWindow.isMinimized()) mainWindow.hide()
  else showMainWindow()
}

// ─── Tray ────────────────────────────────────────────────────────────────────
function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: status.detail, enabled: false },
    { type: 'separator' },
    { label: 'Show / Hide', click: toggleMainWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}

function refreshTray(): void {
  if (!tray) return
  const prefix = status.incoming ? '📞 Incoming — ' : status.inCall ? 'In call — ' : ''
  tray.setToolTip(`PBX Client — ${prefix}${status.detail}`)
  tray.setContextMenu(buildTrayMenu())
}

function createTray(): void {
  const image = nativeImage.createFromPath(icon)
  tray = new Tray(image.isEmpty() ? icon : image)
  tray.on('click', toggleMainWindow)
  refreshTray()
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
function registerIpc(): void {
  ipcMain.handle(IPC.configGet, () => sipConfig)
  ipcMain.handle(IPC.configPath, () => configPath())
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }))
  ipcMain.handle(IPC.configSet, (_e, cfg: SipConfig) => {
    sipConfig = { ...DEFAULT_SIP_CONFIG, ...cfg }
    // Never allow an empty instance id — keep/generate one.
    if (!sipConfig.instanceId) sipConfig.instanceId = randomUUID()
    persistConfig()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.configChanged, sipConfig)
    }
  })

  ipcMain.on(IPC.appSetStatus, (_e, next: AppStatus) => {
    status = next
    refreshTray()
  })

  ipcMain.on(IPC.notifyIncoming, (_e, { callId, label }: IncomingCallPayload) => {
    // Bring the app to the foreground (restore from tray / raise to top).
    showMainWindow()
    if (!Notification.isSupported() || incomingNotifications.has(callId)) return
    const n = new Notification({
      title: 'Incoming call',
      body: label,
      icon,
      urgency: 'critical',
      timeoutType: 'never',
      // Action buttons (Linux/macOS where the notification server supports them;
      // ignored on Windows). Index 0 = Answer, 1 = Reject.
      actions: [
        { type: 'button', text: 'Answer' },
        { type: 'button', text: 'Reject' }
      ]
    })
    n.on('action', (_event, index) => {
      if (index === 0) {
        showMainWindow()
        mainWindow?.webContents.send(IPC.answerCall, callId)
      } else if (index === 1) {
        mainWindow?.webContents.send(IPC.rejectCall, callId)
      }
      n.close()
    })
    // Clicking the notification body just focuses the app (decide in-app).
    n.on('click', () => showMainWindow())
    n.on('close', () => incomingNotifications.delete(callId))
    incomingNotifications.set(callId, n)
    n.show()
  })

  ipcMain.on(IPC.clearIncoming, (_e, callId: string) => {
    incomingNotifications.get(callId)?.close()
    incomingNotifications.delete(callId)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    // Window header / taskbar icon (Linux + Windows; ignored on macOS).
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Close to tray instead of quitting.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('org.yeti.pbx-client')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    loadConfig()
    registerIpc()
    createWindow()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showMainWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  // Keep running in the tray when all windows are closed/hidden.
  app.on('window-all-closed', () => {
    // Intentionally do not quit — the tray keeps the app alive. Quit is explicit
    // via the tray menu (or Cmd+Q on macOS).
  })
}
