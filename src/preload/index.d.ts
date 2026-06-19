import { ElectronAPI } from '@electron-toolkit/preload'
import type { PbxApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PbxApi
  }
}
