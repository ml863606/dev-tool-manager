import { ipcMain } from 'electron'
import { dirname, extname, join } from 'path'
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'fs'
import { ensureDir, move, pathExists, remove } from 'fs-extra'
import AdmZip from 'adm-zip'
import log from 'electron-log'
import type { DownloadTask, InstalledTool, RedisInstallPayload, ToolConfig } from '../../../shared/types'
import { upsertTask } from '../../task-db'
import { sendToRenderer } from '../../ipc-utils'

type InstalledStore = {
  get: (key: 'installed') => Record<string, InstalledTool>
  set: (key: 'installed', value: Record<string, InstalledTool>) => void
}

type PortUsage = {
  available: boolean
  port: number
  pid?: number
  processName?: string
  path?: string
  state?: string
}

type RegisterRedisHandlersOptions = {
  mainWindow: Electron.BrowserWindow
  store: InstalledStore
  getToolsCatalog: () => Promise<ToolConfig[]>
  generateId: () => string
  formatBytes: (bytes: number) => string
  checkPortUsage: (port: number) => Promise<PortUsage>
  isWindowsElevated: () => Promise<boolean>
  runLoggedProcess: (command: string, args: string[], cwd: string, onLog: (line: string) => void) => Promise<void>
  execAsync: (command: string, options?: any) => Promise<{ stdout: string; stderr: string }>
}

function isValidZipFile(filePath: string): boolean {
  let fd: number | null = null
  try {
    const stat = statSync(filePath)
    if (stat.size < 22) return false
    const tailSize = Math.min(stat.size, 65557)
    const buffer = Buffer.alloc(tailSize)
    fd = openSync(filePath, 'r')
    readSync(fd, buffer, 0, tailSize, stat.size - tailSize)
    return buffer.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  } catch {
    return false
  } finally {
    if (fd !== null) closeSync(fd)
  }
}


export function registerRedisHandlers(options: RegisterRedisHandlersOptions): void {
  const { mainWindow, store, getToolsCatalog, generateId, formatBytes, checkPortUsage, isWindowsElevated, runLoggedProcess, execAsync } = options

  ipcMain.handle('redis:installLocal', async (_event, payload: RedisInstallPayload) => {
    log.info(`[redis install] start version=${payload.version} file=${payload.filePath} installDir=${payload.installDir}`)
    const toolsCatalog = await getToolsCatalog()
    const toolConfig = toolsCatalog.find((t) => t.id === 'redis')
    const taskId = generateId()
    const task: DownloadTask = {
      id: taskId,
      toolId: 'redis',
      toolName: toolConfig?.name ?? 'Redis',
      version: payload.version,
      status: 'completed',
      progress: 100,
      speed: '0 B/s',
      totalSize: existsSync(payload.filePath) ? formatBytes(statSync(payload.filePath).size) : '未知',
      downloadedSize: existsSync(payload.filePath) ? formatBytes(statSync(payload.filePath).size) : '未知',
      mirrorUsed: 'huawei',
      filePath: payload.filePath,
      downloadUrl: payload.filePath,
      startedAt: new Date().toISOString()
    }
    sendToRenderer(mainWindow, 'download:progress', task)
    await upsertTask(task)

    const sendLog = (msg: string) => sendToRenderer(mainWindow, 'install:status', { taskId, msg })
    const done = async (patch: Partial<DownloadTask>) => {
      const next = { ...task, ...patch, completedAt: new Date().toISOString() } as DownloadTask
      sendToRenderer(mainWindow, 'download:progress', next)
      await upsertTask(next)
    }

    try {
      if (!existsSync(payload.filePath)) throw new Error(`安装包不存在: ${payload.filePath}`)
      if (extname(payload.filePath).toLowerCase() !== '.zip') throw new Error('Redis 本地安装仅支持 zip 包')
      if (!isValidZipFile(payload.filePath)) {
        throw new Error(`Redis 安装包不是有效 zip 文件，可能下载不完整或下载到了错误页面。请删除后重新下载: ${payload.filePath}`)
      }

      const installDir = payload.installDir
      const redisServer = join(installDir, 'redis-server.exe')
      const redisService = join(installDir, 'RedisService.exe')
      const redisCli = join(installDir, 'redis-cli.exe')
      const redisConf = join(installDir, 'redis.conf')

      sendLog(`开始 Redis 本地安装: ${payload.version}`)
      sendLog(`安装包: ${payload.filePath}`)
      sendLog(`解压目录: ${installDir}`)

      const portUsage = await checkPortUsage(payload.port)
      if (!portUsage.available) {
        const owner = portUsage.processName
          ? `${portUsage.processName}${portUsage.pid ? ` (PID ${portUsage.pid})` : ''}`
          : portUsage.pid
            ? `PID ${portUsage.pid}`
            : '未知进程'
        throw new Error(`端口 ${payload.port} 已被占用: ${owner}`)
      }
      sendLog(`端口 ${payload.port} 可用`)

      if (await pathExists(installDir)) {
        await remove(installDir)
        sendLog('已清理旧解压目录')
      }
      await ensureDir(dirname(installDir))
      const zip = new AdmZip(payload.filePath)
      zip.extractAllTo(installDir, true)
      const entries = await import('fs').then((fs) => fs.readdirSync(installDir))
      if (entries.length === 1) {
        const subDir = join(installDir, entries[0])
        if (await pathExists(join(subDir, 'redis-server.exe')) || await pathExists(join(subDir, 'RedisService.exe'))) {
          const tmpDir = `${installDir}_tmp`
          await move(subDir, tmpDir)
          await remove(installDir)
          await move(tmpDir, installDir)
        }
      }
      sendLog('解压完成')

      if (!existsSync(redisServer)) throw new Error(`未找到 redis-server.exe: ${redisServer}`)
      if (!existsSync(redisService)) throw new Error(`未找到 RedisService.exe: ${redisService}`)
      writeFileSync(redisConf, payload.configText, 'utf8')
      sendLog(`已写入配置文件: ${redisConf}`)

      const serviceExists = await execAsync(`sc query "${payload.serviceName}"`).then(() => true).catch(() => false)
      if (serviceExists) throw new Error(`服务名已存在: ${payload.serviceName}`)
      if (!(await isWindowsElevated())) {
        throw new Error('安装 Redis Windows 服务需要管理员权限，请关闭当前 dev 窗口后，用管理员身份启动 npm run dev 再安装。')
      }

      await runLoggedProcess(redisService, [
        'install',
        '-c', redisConf,
        '--dir', installDir,
        '--port', String(payload.port),
        '--service-name', payload.serviceName,
        '--display-name', payload.serviceName,
        '--description', `Redis ${payload.version}`,
        '--start-mode', 'auto',
        '--loglevel', 'notice'
      ], installDir, sendLog)
      sendLog(`服务注册完成: ${payload.serviceName}`)

      await runLoggedProcess('net', ['start', payload.serviceName], installDir, sendLog)
      sendLog('服务启动完成')

      const installed = store.get('installed')
      installed.redis = {
        id: 'redis',
        version: payload.version,
        installPath: installDir,
        exePath: redisCli,
        installedAt: new Date().toISOString()
      }
      store.set('installed', installed)
      sendLog('Redis 安装完成')
      await done({ status: 'completed', progress: 100 })
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'redis', success: true, installPath: installDir })
      return taskId
    } catch (err: any) {
      const message = err?.message ?? String(err)
      sendLog(`安装失败: ${message}`)
      await done({ status: 'error', error: message })
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'redis', success: false, error: message })
      log.error(`[redis install] failed: ${message}`)
      throw new Error(message)
    }
  })
}
