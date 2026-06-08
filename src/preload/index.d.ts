import type { AppSettings, DownloadTask, IpcDownloadPayload, MysqlInstallPayload, NodeVersion } from '../shared/types'

declare global {
  interface Window {
    api: {
      tools: {
        list: () => Promise<any[]>
        autoDetect: () => Promise<any[]>
        onDetectProgress: (cb: (data: any) => void) => () => void
        verify: (toolId: string) => Promise<string | null>
        openDir: (dirPath: string) => Promise<void>
        unmark: (toolId: string) => Promise<boolean>
      }
      settings: {
        get: () => Promise<AppSettings>
        save: (settings: AppSettings) => Promise<boolean>
      }
      taskCache: {
        get: () => Promise<{ downloadTasks: Array<[string, DownloadTask]>; installLogs: Array<[string, string[]]> }>
        save: (payload: { downloadTasks: Array<[string, DownloadTask]>; installLogs: Array<[string, string[]]> }) => Promise<boolean>
      }
      network: {
        detect: () => Promise<string>
        probeAll: () => Promise<Array<{ region: string; url: string; ok: boolean; latency: number | null }>>
      }
      python: {
        fetchVersions: () => Promise<Array<{ version: string }>>
      }
      jdk: {
        fetchVersions: (vendorId?: string) => Promise<Array<{ version: string; lts: boolean; major: number; filename: string; downloadUrls: Record<string, string> }>>
        fetchVendors: () => Promise<Array<{ id: string; name: string }>>
      }
      nodejs: {
        fetchVersions: () => Promise<NodeVersion[]>
      }
      maven: {
        fetchVersions: () => Promise<Array<{ version: string }>>
      }
      mysql: {
        fetchVersions: () => Promise<Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<string, string> }>>
        installLocal: (payload: MysqlInstallPayload) => Promise<string>
      }
      git: {
        fetchVersions: () => Promise<Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<string, string> }>>
      }
      codex: {
        fetchVersions: () => Promise<Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<string, string> }>>
      }
      claudeCode: {
        fetchVersions: () => Promise<Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<string, string> }>>
      }
      npmRegistry: {
        get: () => Promise<string>
        list: () => Promise<Array<{ name: string; url: string; ok: boolean; latency: number | null; current: boolean }>>
        set: (url: string) => Promise<boolean>
      }
      download: {
        start: (payload: IpcDownloadPayload) => Promise<string>
        pause: (taskId: string) => Promise<void>
        findCached: (filename: string) => Promise<{ filePath: string; size: string } | null>
        openFile: (filePath: string) => Promise<void>
        onProgress: (cb: (task: DownloadTask) => void) => () => void
        onInstallStatus: (cb: (data: { taskId: string; msg: string }) => void) => () => void
        onInstallComplete: (cb: (data: any) => void) => () => void
      }
      dialog: {
        selectDir: (defaultPath?: string) => Promise<string | null>
      }
      log: (level: string, ...args: any[]) => void
    }
  }
}
