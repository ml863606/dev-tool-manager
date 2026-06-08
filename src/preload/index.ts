import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, IpcDownloadPayload, MysqlInstallPayload, RedisInstallPayload } from '../shared/types'

const api = {
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    autoDetect: () => ipcRenderer.invoke('tools:autoDetect'),
    clearCache: () => ipcRenderer.invoke('tools:clearCache'),
    onDetectProgress: (cb: (data: any) => void) => {
      ipcRenderer.on('tools:detectProgress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('tools:detectProgress')
    },
    verify: (toolId: string) => ipcRenderer.invoke('tool:verify', toolId),
    openDir: (dirPath: string) => ipcRenderer.invoke('tool:openDir', dirPath),
    unmark: (toolId: string) => ipcRenderer.invoke('tool:unmark', toolId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings)
  },
  taskCache: {
    get: () => ipcRenderer.invoke('taskCache:get'),
    save: (payload: { downloadTasks: Array<[string, any]>; installLogs: Array<[string, string[]]> }) =>
      ipcRenderer.invoke('taskCache:save', payload)
  },
  network: {
    detect: () => ipcRenderer.invoke('network:detect'),
    probeAll: () => ipcRenderer.invoke('network:probeAll'),
    checkPort: (port: number) => ipcRenderer.invoke('network:checkPort', port),
    listPorts: () => ipcRenderer.invoke('network:listPorts')
  },
  python: {
    fetchVersions: () => ipcRenderer.invoke('python:fetchVersions')
  },
  jdk: {
    fetchVersions: (vendorId?: string) => ipcRenderer.invoke('jdk:fetchVersions', vendorId),
    fetchVendors: () => ipcRenderer.invoke('jdk:fetchVendors')
  },
  nodejs: {
    fetchVersions: () => ipcRenderer.invoke('nodejs:fetchVersions')
  },
  maven: {
    fetchVersions: () => ipcRenderer.invoke('maven:fetchVersions')
  },
  mysql: {
    fetchVersions: () => ipcRenderer.invoke('mysql:fetchVersions'),
    installLocal: (payload: MysqlInstallPayload) => ipcRenderer.invoke('mysql:installLocal', payload)
  },
  redis: {
    installLocal: (payload: RedisInstallPayload) => ipcRenderer.invoke('redis:installLocal', payload)
  },
  git: {
    fetchVersions: () => ipcRenderer.invoke('git:fetchVersions')
  },
  codex: {
    fetchVersions: () => ipcRenderer.invoke('codex:fetchVersions')
  },
  claudeCode: {
    fetchVersions: () => ipcRenderer.invoke('claudeCode:fetchVersions')
  },
  npmRegistry: {
    get: () => ipcRenderer.invoke('npmRegistry:get'),
    list: () => ipcRenderer.invoke('npmRegistry:list'),
    set: (url: string) => ipcRenderer.invoke('npmRegistry:set', url)
  },
  download: {
    start: (payload: IpcDownloadPayload) => ipcRenderer.invoke('download:start', payload),
    pause: (taskId: string) => ipcRenderer.invoke('download:pause', taskId),
    findCached: (filename: string) => ipcRenderer.invoke('download:findCached', filename),
    openFile: (filePath: string) => ipcRenderer.invoke('download:openFile', filePath),
    onProgress: (cb: (task: any) => void) => {
      ipcRenderer.on('download:progress', (_e, task) => cb(task))
      return () => ipcRenderer.removeAllListeners('download:progress')
    },
    onInstallStatus: (cb: (data: { taskId: string; msg: string }) => void) => {
      ipcRenderer.on('install:status', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('install:status')
    },
    onInstallComplete: (cb: (data: any) => void) => {
      ipcRenderer.on('install:complete', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('install:complete')
    }
  },
  dialog: {
    selectDir: (defaultPath?: string) => ipcRenderer.invoke('dialog:selectDir', defaultPath)
  },
  log: (level: string, ...args: any[]) => ipcRenderer.send('renderer:log', level, ...args)
}

contextBridge.exposeInMainWorld('api', api)
