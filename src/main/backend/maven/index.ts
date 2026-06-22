import { ipcMain } from 'electron'
import axios from 'axios'
import { dirname, extname, join } from 'path'
import { statSync, writeFileSync } from 'fs'
import { ensureDir, move, pathExists, remove } from 'fs-extra'
import AdmZip from 'adm-zip'
import log from 'electron-log'
import type { DownloadTask, InstalledTool, MavenInstallPayload, ToolConfig } from '../../../shared/types'
import { configureEnvVar } from '../../installer'
import { sendToRenderer } from '../../ipc-utils'
import { upsertTask } from '../../task-db'

type InstalledStore = {
  get: (key: 'installed') => Record<string, InstalledTool>
  set: (key: 'installed', value: Record<string, InstalledTool>) => void
}

type RegisterMavenHandlersOptions = {
  mainWindow: Electron.BrowserWindow
  store: InstalledStore
  getToolsCatalog: () => Promise<ToolConfig[]>
  generateId: () => string
  formatBytes: (bytes: number) => string
}

export function registerMavenHandlers(options: RegisterMavenHandlersOptions): void {
  const { mainWindow, store, getToolsCatalog, generateId, formatBytes } = options

  ipcMain.handle('maven:installLocal', async (_event, payload: MavenInstallPayload) => {
    const toolsCatalog = await getToolsCatalog()
    const toolConfig = toolsCatalog.find((t) => t.id === 'maven')
    if (!toolConfig) throw new Error('Maven 配置不存在')

    const taskId = generateId()
    const stat = statSync(payload.filePath)
    const task: DownloadTask = {
      id: taskId,
      toolId: 'maven',
      toolName: toolConfig.name,
      version: payload.version,
      status: 'completed',
      progress: 100,
      speed: '0 B/s',
      totalSize: formatBytes(stat.size),
      downloadedSize: formatBytes(stat.size),
      mirrorUsed: payload.mirrorId,
      filePath: payload.filePath,
      downloadUrl: payload.filePath,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }
    sendToRenderer(mainWindow, 'download:progress', task)
    await upsertTask(task)

    const sendLog = (msg: string) => sendToRenderer(mainWindow, 'install:status', { taskId, msg })
    try {
      if (extname(payload.filePath).toLowerCase() !== '.zip') throw new Error('Maven 本地安装仅支持 zip 包')

      const installDir = payload.installDir
      sendLog(`开始 Maven 本地安装: ${payload.version}`)
      sendLog(`安装包: ${payload.filePath}`)
      sendLog(`解压目录: ${installDir}`)
      sendLog(`依赖仓库目录: ${payload.repositoryDir}`)
      sendLog(`镜像仓库: ${payload.mirrorName} (${payload.mirrorUrl})`)

      if (await pathExists(installDir)) {
        await remove(installDir)
        sendLog('已清理旧安装目录')
      }
      await ensureDir(dirname(installDir))
      const zip = new AdmZip(payload.filePath)
      zip.extractAllTo(installDir, true)

      const entries = await import('fs').then((fs) => fs.readdirSync(installDir))
      if (entries.length === 1) {
        const subDir = join(installDir, entries[0])
        if (statSync(subDir).isDirectory()) {
          const tmpDir = `${installDir}_tmp`
          await move(subDir, tmpDir)
          await remove(installDir)
          await move(tmpDir, installDir)
          sendLog('已整理 Maven 顶层目录')
        }
      }

      const settingsPath = join(installDir, 'conf', 'settings.xml')
      await ensureDir(dirname(settingsPath))
      await ensureDir(payload.repositoryDir)
      writeFileSync(settingsPath, payload.settingsXml, 'utf-8')
      sendLog(`已写入 Maven 配置: ${settingsPath}`)

      await configureEnvVar('maven', installDir, toolConfig.pathAppend)
      sendLog('环境变量配置完成')

      const installed = store.get('installed')
      installed.maven = {
        id: 'maven',
        version: payload.version,
        installPath: installDir,
        installedAt: new Date().toISOString()
      }
      store.set('installed', installed)
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'maven', success: true, installPath: installDir })
      return taskId
    } catch (err: any) {
      const message = err?.message ?? String(err)
      sendLog(`Maven 安装失败: ${message}`)
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'maven', success: false, error: message })
      return taskId
    }
  })

  ipcMain.handle('maven:fetchVersions', async () => {
    const metadataUrls = [
      'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml',
      'https://maven.aliyun.com/repository/public/org/apache/maven/apache-maven/maven-metadata.xml',
      'https://repo.huaweicloud.com/repository/maven/org/apache/maven/apache-maven/maven-metadata.xml'
    ]
    for (const url of metadataUrls) {
      try {
        log.info(`[maven versions] 尝试: ${url}`)
        const res = await axios.get<string>(url, { timeout: 6000 })
        const xml = res.data
        const versions: string[] = []
        const regex = /<version>(3\.\d+\.\d+)<\/version>/g
        let m: RegExpExecArray | null
        while ((m = regex.exec(xml)) !== null) {
          versions.push(m[1])
        }
        const unique = [...new Set(versions)].sort((a, b) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
          }
          return 0
        }).slice(0, 20)
        log.info(`[maven versions] 成功，${unique.length} 个版本，来源: ${url}`)
        return unique.map((v) => ({ version: v }))
      } catch (e: any) {
        log.warn(`[maven versions] 失败: ${url} — ${e.message}`)
      }
    }
    return []
  })
}
