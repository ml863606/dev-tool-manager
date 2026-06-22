import { ipcMain } from 'electron'
import axios from 'axios'
import { dirname, extname, join } from 'path'
import { existsSync, statSync, writeFileSync } from 'fs'
import { ensureDir, move, pathExists, remove } from 'fs-extra'
import AdmZip from 'adm-zip'
import log from 'electron-log'
import type { DownloadTask, InstalledTool, MysqlInstallPayload, ToolConfig } from '../../../shared/types'
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

type RegisterMysqlHandlersOptions = {
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

function buildMysqlVersion(version: string, series: string, mirrorBaseUrl: string, date = '') {
  const filename = `mysql-${version}-winx64.zip`
  return {
    version,
    date,
    lts: false,
    filename,
    downloadUrls: {
      official: `https://cdn.mysql.com/archives/mysql-${series}/${filename}`,
      aliyun: `${mirrorBaseUrl}${filename}`,
      huawei: `${mirrorBaseUrl}${filename}`,
      tencent: `${mirrorBaseUrl}${filename}`
    }
  }
}

export function registerMysqlHandlers(options: RegisterMysqlHandlersOptions): void {
  const { mainWindow, store, getToolsCatalog, generateId, formatBytes, checkPortUsage, isWindowsElevated, runLoggedProcess, execAsync } = options

  ipcMain.handle('mysql:installLocal', async (_event, payload: MysqlInstallPayload) => {
    const toolsCatalog = await getToolsCatalog()
    const toolConfig = toolsCatalog.find((t) => t.id === 'mysql')
    const taskId = generateId()
    const task: DownloadTask = {
      id: taskId,
      toolId: 'mysql',
      toolName: toolConfig?.name ?? 'MySQL',
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
      if (extname(payload.filePath).toLowerCase() !== '.zip') throw new Error('MySQL 本地安装仅支持 zip 包')

      const installDir = payload.installDir
      const dataDir = join(installDir, 'data')
      const binDir = join(installDir, 'bin')
      const mysqld = join(binDir, 'mysqld.exe')
      const mysqladmin = join(binDir, 'mysqladmin.exe')
      const myIniPath = join(installDir, 'my.ini')

      sendLog(`开始 MySQL 本地安装: ${payload.version}`)
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
        if (await pathExists(join(subDir, 'bin', 'mysqld.exe'))) {
          const tmpDir = `${installDir}_tmp`
          await move(subDir, tmpDir)
          await remove(installDir)
          await move(tmpDir, installDir)
        }
      }
      sendLog('解压完成')

      if (!existsSync(mysqld)) throw new Error(`未找到 mysqld.exe: ${mysqld}`)
      await ensureDir(dataDir)
      writeFileSync(myIniPath, payload.myIni, 'utf8')
      sendLog(`已写入配置文件: ${myIniPath}`)

      await runLoggedProcess(mysqld, [`--defaults-file=${myIniPath}`, '--initialize-insecure', `--console`], installDir, sendLog)
      sendLog('数据目录初始化完成')

      const serviceExists = await execAsync(`sc query "${payload.serviceName}"`).then(() => true).catch(() => false)
      if (serviceExists) throw new Error(`服务名已存在: ${payload.serviceName}`)
      if (!(await isWindowsElevated())) {
        throw new Error('安装 MySQL Windows 服务需要管理员权限，请关闭当前 dev 窗口后，用管理员身份启动 npm run dev 再安装。')
      }

      await runLoggedProcess(mysqld, [`--install`, payload.serviceName, `--defaults-file=${myIniPath}`], installDir, sendLog)
      sendLog(`服务注册完成: ${payload.serviceName}`)

      await runLoggedProcess('net', ['start', payload.serviceName], installDir, sendLog)
      sendLog('服务启动完成')

      if (payload.password) {
        await runLoggedProcess(mysqladmin, ['-u', 'root', '-h', payload.host, `-P${payload.port}`, 'password', payload.password], installDir, sendLog)
        sendLog('root 密码设置完成')
      }

      const installed = store.get('installed')
      installed.mysql = {
        id: 'mysql',
        version: payload.version,
        installPath: installDir,
        exePath: join(binDir, 'mysql.exe'),
        installedAt: new Date().toISOString()
      }
      store.set('installed', installed)
      sendLog('MySQL 安装完成')
      await done({ status: 'completed', progress: 100 })
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'mysql', success: true, installPath: installDir })
      return taskId
    } catch (err: any) {
      const message = err?.message ?? String(err)
      sendLog(`安装失败: ${message}`)
      await done({ status: 'error', error: message })
      sendToRenderer(mainWindow, 'install:complete', { taskId, toolId: 'mysql', success: false, error: message })
      return taskId
    }
  })

  ipcMain.handle('mysql:fetchVersions', async () => {
    const seriesSources = [
      {
        series: '8.0',
        urls: [
          'https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0/',
          'https://mirrors.aliyun.com/mysql/Downloads/MySQL-8.0/'
        ]
      },
      {
        series: '5.7',
        urls: [
          'https://repo.huaweicloud.com/mysql/Downloads/MySQL-5.7/',
          'https://mirrors.aliyun.com/mysql/Downloads/MySQL-5.7/'
        ]
      }
    ]

    const allVersions = new Map<string, ReturnType<typeof buildMysqlVersion>>()
    for (const source of seriesSources) {
      for (const url of source.urls) {
        try {
          log.info(`[mysql versions] 尝试: ${url}`)
          const res = await axios.get<string>(url, { timeout: 6000 })
          const html = res.data
          const regex = new RegExp(`mysql-(${source.series.replace('.', '\\.')}\\.\\d+)-winx64\\.zip[\\s\\S]{0,160}?(\\d{4}-\\d{2}-\\d{2}|\\d{2}-[A-Za-z]{3}-\\d{4})?`, 'g')
          let m: RegExpExecArray | null
          while ((m = regex.exec(html)) !== null) {
            allVersions.set(m[1], buildMysqlVersion(m[1], source.series, url, m[2] ?? ''))
          }
          log.info(`[mysql versions] ${source.series} 来源 ${url} 解析到 ${allVersions.size} 个累计版本`)
          break
        } catch (e: any) {
          log.warn(`[mysql versions] ${source.series} 失败: ${url} — ${e.message}`)
        }
      }
    }

    const sorted = [...allVersions.values()].sort((a, b) => {
      const pa = a.version.split('.').map(Number)
      const pb = b.version.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
      }
      return 0
    })
    if (sorted.length) {
      log.info(`[mysql versions] 成功，共 ${sorted.length} 个版本`)
      return sorted.slice(0, 40)
    }

    return [
      buildMysqlVersion('8.0.27', '8.0', 'https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0/'),
      buildMysqlVersion('5.7.38', '5.7', 'https://repo.huaweicloud.com/mysql/Downloads/MySQL-5.7/')
    ]
  })
}
