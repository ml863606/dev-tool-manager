export type ToolStatus = 'not_installed' | 'installing' | 'installed' | 'checking'

export type MirrorRegion = 'aliyun' | 'huawei' | 'tencent' | 'official'

export interface MirrorSource {
  region: MirrorRegion
  label: string
  url: string
}

export interface ToolVersion {
  version: string
  downloadUrls: Record<MirrorRegion | 'official', string>
  filename: string
  size?: number
  sha256?: string
}

export interface ToolConfig {
  id: string
  name: string
  description: string
  category: 'backend' | 'frontend' | 'database' | 'ai' | 'other'
  icon: string
  homepage: string
  versions: ToolVersion[]
  installArgs?: string[]
  envVars?: Record<string, string>
  pathAppend?: string
  verifyCommand?: string
}

export interface InstalledTool {
  id: string
  version: string
  installPath: string
  exePath?: string
  installedAt: string
}

export interface DownloadTask {
  id: string
  toolId: string
  toolName: string
  version: string
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'paused'
  progress: number
  speed: string
  totalSize: string
  downloadedSize: string
  mirrorUsed: MirrorRegion | 'official'
  error?: string
  filePath?: string
  downloadUrl?: string
  startedAt?: string
  completedAt?: string
}

export interface AppSettings {
  installBaseDir: string
  downloadDir: string
  preferredMirror: MirrorRegion | 'auto'
  probeTimeoutMs: number
  concurrentDownloads: number
  autoDetectInstalled: boolean
  githubProxyPrefix: string
}

export interface NodeVersion {
  version: string
  date: string
  lts: string | false
  npm: string
}

export interface IpcDownloadPayload {
  toolId: string
  version: string
  mirror?: MirrorRegion | 'auto'
  dynamicUrls?: Record<MirrorRegion | 'official', string>
  dynamicFilename?: string
  downloadOnly?: boolean
  installDir?: string
}

export interface IpcInstallPayload {
  toolId: string
  version: string
  filePath: string
  installDir?: string
}

export interface MysqlInstallPayload {
  version: string
  filePath: string
  installDir: string
  serviceName: string
  host: string
  port: number
  password: string
  myIni: string
}

export interface RedisInstallPayload {
  version: string
  filePath: string
  installDir: string
  serviceName: string
  host: string
  port: number
  password: string
  configText: string
}
