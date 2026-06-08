import { ipcMain, shell, dialog } from 'electron'
import axios from 'axios'
import { basename, dirname, extname, join } from 'path'
import { randomBytes } from 'crypto'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { ensureDir, move, pathExists, remove } from 'fs-extra'
import AdmZip from 'adm-zip'
import log from 'electron-log'
import Store from 'electron-store'
import { TOOLS_CONFIG, DEFAULT_SETTINGS } from '../shared/tools.config'
import { downloader } from './downloader'
import { installTool, verifyInstall, findCommandPath, extractVersion } from './installer'
import { resolveBestDownloadUrl, detectBestMirror, probeAll } from './network'
import { loadTaskCache, loadToolsCatalog, saveTaskCache, saveToolsCatalog, upsertTask } from './task-db'
import type { AppSettings, DownloadTask, InstalledTool, IpcDownloadPayload, MysqlInstallPayload, ToolConfig } from '../shared/types'
const execAsync = promisify(exec)

function generateId(): string {
  return randomBytes(4).toString('hex')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function runLoggedProcess(
  command: string,
  args: string[],
  cwd: string,
  onLog: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    onLog(`> ${command} ${args.join(' ')}`)
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false })
    child.stdout.on('data', (chunk) => {
      chunk.toString().split(/\r?\n/).filter(Boolean).forEach((line) => onLog(line))
    })
    child.stderr.on('data', (chunk) => {
      chunk.toString().split(/\r?\n/).filter(Boolean).forEach((line) => onLog(line))
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${basename(command)} 退出码: ${code}`))
    })
  })
}

const store = new Store<{
  settings: AppSettings
  installed: Record<string, InstalledTool>
}>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    installed: {}
  }
})

export function registerIpcHandlers(mainWindow: Electron.BrowserWindow): void {
  async function resolveDownloadUrl(url: string): Promise<string> {
    if (!url.includes('api.foojay.io') || !url.includes('/redirect')) return url
    try {
      const res = await axios.get(url, {
        timeout: 8000,
        maxRedirects: 0,
        validateStatus: (s) => s >= 300 && s < 400
      })
      const location = String(res.headers?.location ?? '').trim()
      if (location) {
        log.info(`[download] foojay redirect resolved: ${location}`)
        return location
      }
      return url
    } catch (e: any) {
      const location = String(e?.response?.headers?.location ?? '').trim()
      if (location) {
        log.info(`[download] foojay redirect resolved(from error): ${location}`)
        return location
      }
      log.warn(`[download] resolve redirect failed, fallback original: ${e?.message ?? e}`)
      return url
    }
  }

  async function getToolsCatalog(): Promise<ToolConfig[]> {
    const fromDb = await loadToolsCatalog()
    const hasLatestTools = TOOLS_CONFIG.every((tool) => fromDb.some((cached) => cached.id === tool.id))
    if (fromDb.length > 0 && hasLatestTools) return fromDb
    await saveToolsCatalog(TOOLS_CONFIG)
    return TOOLS_CONFIG
  }

  ipcMain.handle('tools:list', async () => {
    const toolsCatalog = await getToolsCatalog()
    const installed = store.get('installed') as Record<string, InstalledTool>
    return toolsCatalog.map((tool) => ({
      ...tool,
      installed: installed[tool.id] ?? null
    }))
  })

  ipcMain.handle('tools:clearCache', () => {
    store.set('installed', {})
    return true
  })

  ipcMain.handle('tools:autoDetect', async () => {
    const toolsCatalog = await getToolsCatalog()
    const installed = store.get('installed') as Record<string, InstalledTool>
    let changed = false

    for (const tool of toolsCatalog) {
      mainWindow.webContents.send('tools:detectProgress', {
        toolId: tool.id,
        toolName: tool.name,
        status: 'checking'
      })

      const [version, { exePath, allPaths }] = await Promise.all([
        verifyInstall(tool.verifyCommand),
        findCommandPath(tool.verifyCommand)
      ])

      if (version) {
        const cleanVersion = extractVersion(version)
        const installPath = exePath ?? 'system'
        installed[tool.id] = {
          id: tool.id,
          version: cleanVersion,
          installPath,
          exePath: exePath ?? undefined,
          installedAt: installed[tool.id]?.installedAt ?? new Date().toISOString()
        }
        changed = true
        mainWindow.webContents.send('tools:detectProgress', {
          toolId: tool.id,
          toolName: tool.name,
          status: 'found',
          version: cleanVersion,
          installPath,
          allPaths
        })
      } else {
        if (installed[tool.id]?.installPath === 'system') {
          delete installed[tool.id]
          changed = true
        }
        mainWindow.webContents.send('tools:detectProgress', {
          toolId: tool.id,
          toolName: tool.name,
          status: 'not_found'
        })
      }
    }

    if (changed) store.set('installed', installed)

    mainWindow.webContents.send('tools:detectProgress', { status: 'done' })

    return toolsCatalog.map((tool) => ({
      ...tool,
      installed: installed[tool.id] ?? null
    }))
  })

  ipcMain.handle('settings:get', () => {
    const settings = store.get('settings') as AppSettings
    if (settings.preferredMirror === 'auto') {
      const next = { ...settings, preferredMirror: DEFAULT_SETTINGS.preferredMirror }
      store.set('settings', next)
      return next
    }
    return settings
  })

  ipcMain.handle('settings:save', (_event, settings: AppSettings) => {
    store.set('settings', settings)
    return true
  })

  ipcMain.handle('taskCache:get', async () => {
    return loadTaskCache()
  })

  ipcMain.handle(
    'taskCache:save',
    async (_event, payload: { downloadTasks: Array<[string, DownloadTask]>; installLogs: Array<[string, string[]]> }) => {
      await saveTaskCache(payload)
      return true
    }
  )

  ipcMain.handle('network:detect', async () => {
    const settings = store.get('settings') as AppSettings
    return detectBestMirror(settings.probeTimeoutMs)
  })

  ipcMain.handle('network:probeAll', async () => {
    const settings = store.get('settings') as AppSettings
    return probeAll(settings.probeTimeoutMs)
  })

  ipcMain.on('renderer:log', (_event, level: string, ...args: any[]) => {
    const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    if (level === 'error') log.error(`[renderer] ${msg}`)
    else if (level === 'warn') log.warn(`[renderer] ${msg}`)
    else log.info(`[renderer] ${msg}`)
  })

  ipcMain.handle('download:start', async (_event, payload: IpcDownloadPayload) => {
    log.info(`[download:start] payload=`, JSON.stringify(payload))
    const settings = store.get('settings') as AppSettings
    log.info(`[download:start] settings=`, JSON.stringify({ installBaseDir: settings?.installBaseDir, downloadDir: settings?.downloadDir, preferredMirror: settings?.preferredMirror }))

    const toolsCatalog = await getToolsCatalog()
    const toolConfig = toolsCatalog.find((t) => t.id === payload.toolId)
    if (!toolConfig) throw new Error(`工具不存在: ${payload.toolId}`)

    let versionConfig = toolConfig.versions.find((v) => v.version === payload.version)
    log.info(`[download:start] staticVersionConfig found=`, !!versionConfig)

    if (!versionConfig && payload.dynamicUrls) {
      const v = payload.version
      let filename: string
      if (payload.dynamicFilename) {
        filename = payload.dynamicFilename
      } else if (payload.toolId === 'maven') {
        filename = `apache-maven-${v}-bin.zip`
      } else if (payload.toolId === 'python') {
        filename = `python-${v}-amd64.exe`
      } else {
        filename = `node-v${v}-win-x64.zip`
      }
      versionConfig = { version: v, filename, downloadUrls: payload.dynamicUrls }
      log.info(`[download:start] built dynamic versionConfig: filename=${filename} urls=`, JSON.stringify(payload.dynamicUrls))
    }

    versionConfig ??= toolConfig.versions[0]
    log.info(`[download:start] final versionConfig: version=${versionConfig.version} filename=${versionConfig.filename}`)

    const downloadDir = settings.downloadDir || join(settings.installBaseDir, '_downloads')
    const cachedFilePath = join(downloadDir, versionConfig.filename)
    if (!versionConfig.downloadUrls[settings.preferredMirror === 'auto' ? 'huawei' : settings.preferredMirror]?.startsWith('npm:') && existsSync(cachedFilePath)) {
      const taskId = generateId()
      const stat = statSync(cachedFilePath)
      const cachedTask: DownloadTask = {
        id: taskId,
        toolId: payload.toolId,
        toolName: toolConfig.name,
        version: versionConfig.version,
        status: 'completed',
        progress: 100,
        speed: '0 B/s',
        totalSize: formatBytes(stat.size),
        downloadedSize: formatBytes(stat.size),
        mirrorUsed: settings.preferredMirror === 'auto' ? 'huawei' : settings.preferredMirror,
        filePath: cachedFilePath,
        downloadUrl: cachedFilePath,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
      mainWindow.webContents.send('download:progress', cachedTask)
      await upsertTask(cachedTask)
      mainWindow.webContents.send('install:status', { taskId, msg: `检测到本地缓存，跳过下载: ${cachedFilePath}` })
      if (payload.downloadOnly || payload.toolId === 'mysql') {
        return taskId
      }
      const result = await installTool(
        payload.toolId,
        cachedFilePath,
        settings.installBaseDir,
        (msg) => mainWindow.webContents.send('install:status', { taskId, msg }),
        toolConfig
      )
      mainWindow.webContents.send('install:complete', {
        taskId,
        toolId: payload.toolId,
        success: result.success,
        installPath: result.installPath,
        error: result.error
      })
      return taskId
    }

    log.info(`[download:start] probing mirrors...`)
    const { url, mirror } = await resolveBestDownloadUrl(
      versionConfig,
      payload.mirror ?? settings.preferredMirror,
      settings.probeTimeoutMs
    )
    const finalUrl = await resolveDownloadUrl(url)
    log.info(`[download:start] resolved: mirror=${mirror} url=${url} finalUrl=${finalUrl}`)

    const taskId = generateId()
    log.info(`[download:start] taskId=${taskId} downloadDir=${downloadDir}`)

    const task: DownloadTask = {
      id: taskId,
      toolId: payload.toolId,
      toolName: toolConfig.name,
      version: versionConfig.version,
      status: 'pending',
      progress: 0,
      speed: '0 B/s',
      totalSize: '未知',
      downloadedSize: '0 B',
      mirrorUsed: mirror,
      downloadUrl: finalUrl,
      startedAt: new Date().toISOString()
    }

    mainWindow.webContents.send('download:progress', task)
    await upsertTask(task)

    if (finalUrl.startsWith('npm:')) {
      const result = await installTool(
        payload.toolId,
        finalUrl,
        settings.installBaseDir,
        (msg) => mainWindow.webContents.send('install:status', { taskId, msg }),
        toolConfig
      )
      if (result.success) {
        const installed = store.get('installed') as Record<string, InstalledTool>
        installed[payload.toolId] = {
          id: payload.toolId,
          version: versionConfig.version,
          installPath: result.installPath,
          installedAt: new Date().toISOString()
        }
        store.set('installed', installed)
        const doneTask = { ...task, status: 'completed' as const, progress: 100 }
        mainWindow.webContents.send('download:progress', doneTask)
        await upsertTask(doneTask)
      }
      return taskId
    }

    downloader
      .download(taskId, finalUrl, downloadDir, versionConfig.filename, (patch) => {
        if (patch.status === 'completed') patch.completedAt = new Date().toISOString()
        const updatedTask = { ...task, ...patch } as DownloadTask
        mainWindow.webContents.send('download:progress', updatedTask)
        void upsertTask(updatedTask)
        if (patch.filePath) task.filePath = patch.filePath
      })
      .then(async (filePath) => {
        if (payload.downloadOnly) {
          mainWindow.webContents.send('install:complete', {
            taskId,
            toolId: payload.toolId,
            success: true,
            downloadOnly: true,
            filePath
          })
          return
        }
        mainWindow.webContents.send('install:status', { taskId, msg: '下载完成，准备安装...' })
        const result = await installTool(
          payload.toolId,
          filePath,
          settings.installBaseDir,
          (msg) => mainWindow.webContents.send('install:status', { taskId, msg }),
          toolConfig
        )
        if (result.success) {
          const installed = store.get('installed') as Record<string, InstalledTool>
          installed[payload.toolId] = {
            id: payload.toolId,
            version: versionConfig.version,
            installPath: result.installPath,
            installedAt: new Date().toISOString()
          }
          store.set('installed', installed)
          mainWindow.webContents.send('install:complete', {
            taskId,
            toolId: payload.toolId,
            success: true,
            installPath: result.installPath
          })
        } else {
          mainWindow.webContents.send('install:complete', {
            taskId,
            toolId: payload.toolId,
            success: false,
            error: result.error
          })
        }
      })
      .catch((err) => {
        log.error('下载失败:', err)
      })

    return taskId
  })

  ipcMain.handle('download:pause', (_event, taskId: string) => {
    downloader.pause(taskId)
  })

  ipcMain.handle('download:openFile', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('download:findCached', async (_event, filename: string) => {
    const settings = store.get('settings') as AppSettings
    const downloadDir = settings.downloadDir || join(settings.installBaseDir, '_downloads')
    const filePath = join(downloadDir, filename)
    if (!existsSync(filePath)) return null
    const stat = statSync(filePath)
    return { filePath, size: formatBytes(stat.size) }
  })

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
    mainWindow.webContents.send('download:progress', task)
    await upsertTask(task)

    const sendLog = (msg: string) => mainWindow.webContents.send('install:status', { taskId, msg })
    const done = async (patch: Partial<DownloadTask>) => {
      const next = { ...task, ...patch, completedAt: new Date().toISOString() } as DownloadTask
      mainWindow.webContents.send('download:progress', next)
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

      await runLoggedProcess(mysqld, [`--install`, payload.serviceName, `--defaults-file=${myIniPath}`], installDir, sendLog)
      sendLog(`服务注册完成: ${payload.serviceName}`)

      await runLoggedProcess('net', ['start', payload.serviceName], installDir, sendLog)
      sendLog('服务启动完成')

      if (payload.password) {
        await runLoggedProcess(mysqladmin, ['-u', 'root', '-h', payload.host, `-P${payload.port}`, 'password', payload.password], installDir, sendLog)
        sendLog('root 密码设置完成')
      }

      const installed = store.get('installed') as Record<string, InstalledTool>
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
      mainWindow.webContents.send('install:complete', { taskId, toolId: 'mysql', success: true, installPath: installDir })
      return taskId
    } catch (err: any) {
      const message = err?.message ?? String(err)
      sendLog(`安装失败: ${message}`)
      await done({ status: 'error', error: message })
      mainWindow.webContents.send('install:complete', { taskId, toolId: 'mysql', success: false, error: message })
      return taskId
    }
  })

  ipcMain.handle('tool:verify', async (_event, toolId: string) => {
    const toolsCatalog = await getToolsCatalog()
    const config = toolsCatalog.find((t) => t.id === toolId)
    return verifyInstall(config?.verifyCommand)
  })

  ipcMain.handle('tool:openDir', (_event, dirPath: string) => {
    shell.openPath(dirPath)
  })

  ipcMain.handle('tool:unmark', (_event, toolId: string) => {
    const installed = store.get('installed') as Record<string, InstalledTool>
    delete installed[toolId]
    store.set('installed', installed)
    return true
  })

  ipcMain.handle('python:fetchVersions', async () => {
    const mirrorUrls = [
      'https://mirrors.tuna.tsinghua.edu.cn/python/',
      'https://repo.huaweicloud.com/python/',
      'https://www.python.org/ftp/python/'
    ]

    const MONTH: Record<string, string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
    }
    function normalizeDate(raw: string): string {
      // DD-Mon-YYYY → YYYY-MM-DD
      const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
      if (m) return `${m[3]}-${MONTH[m[2]] ?? '01'}-${m[1]}`
      return raw
    }

    const mirrors = {
      official: 'https://www.python.org/ftp/python',
      aliyun: 'https://mirrors.tuna.tsinghua.edu.cn/python',
      huawei: 'https://repo.huaweicloud.com/python',
      tencent: 'https://mirrors.tuna.tsinghua.edu.cn/python'
    } as const

    for (const url of mirrorUrls) {
      try {
        log.info(`[python versions] 尝试: ${url}`)
        const res = await axios.get<string>(url, { timeout: 6000 })
        const html = res.data as string

        // capture version + modification date from directory listing
        // nginx:  href="3.15.0/"  ...  07-Apr-2026
        // apache: href="3.15.0/"  ...  2026-04-07
        const lineRe = /href="(3\.\d+\.\d+)\/[^"]*"[^\n]*?(\d{2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/g
        const versionDateMap: Record<string, string> = {}
        let lm: RegExpExecArray | null
        while ((lm = lineRe.exec(html)) !== null) {
          const ver = lm[1].replace(/\s/g, '')
          if (!versionDateMap[ver]) versionDateMap[ver] = normalizeDate(lm[2])
        }

        // fallback: version-only regex for mirrors that omit dates
        if (Object.keys(versionDateMap).length === 0) {
          const simpleRe = /href="(3\.\d+\.\d+)\//g
          while ((lm = simpleRe.exec(html)) !== null) {
            const ver = lm[1].replace(/\s/g, '')
            if (!versionDateMap[ver]) versionDateMap[ver] = ''
          }
        }

        const sorted = Object.keys(versionDateMap).sort((a, b) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
          }
          return 0
        }).slice(0, 20)

        // Only keep versions that actually have Windows x64 installer.
        const verified: Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<'official' | 'aliyun' | 'huawei' | 'tencent', string> }> = []
        for (const v of sorted) {
          const filename = `python-${v}-amd64.exe`
          const officialUrl = `${mirrors.official}/${v}/${filename}`
          try {
            await axios.head(officialUrl, { timeout: 4000, validateStatus: (s) => s < 400 })
            verified.push({
              version: v,
              date: versionDateMap[v] ?? '',
              lts: false as false,
              filename,
              downloadUrls: {
                official: officialUrl,
                aliyun: `${mirrors.aliyun}/${v}/${filename}`,
                huawei: `${mirrors.huawei}/${v}/${filename}`,
                tencent: `${mirrors.tencent}/${v}/${filename}`
              }
            })
          } catch {
            // skip versions without final amd64 installer (e.g. pre-release dirs)
          }
          if (verified.length >= 15) break
        }

        log.info(`[python versions] 成功，目录 ${sorted.length} 个，已校验可下载 ${verified.length} 个，来源: ${url}`)
        return verified
      } catch (e: any) {
        log.warn(`[python versions] 失败: ${url} — ${e.message}`)
      }
    }
    return []
  })

  const jdkVendors = [
    { id: 'openjdk', name: 'OpenJDK', distribution: 'openjdk' },
    { id: 'eclipse', name: 'Eclipse Temurin', distribution: 'temurin' },
    { id: 'bellsoft', name: 'BellSoft Liberica', distribution: 'liberica' },
    { id: 'jetbrains', name: 'JetBrains Runtime', distribution: 'jetbrains' }
  ] as const

  async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms))
  }

  async function fetchFoojayPackages(params: Record<string, string>, retries = 3): Promise<any[]> {
    let lastErr: any
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get('https://api.foojay.io/disco/v3.0/packages', {
          timeout: 12000,
          params
        })
        return (res.data?.result ?? []) as any[]
      } catch (e: any) {
        lastErr = e
        const status = e?.response?.status
        const retryable = e?.code === 'ECONNABORTED' || status === 429 || status === 502 || status === 503 || status === 504
        if (!retryable || i === retries - 1) break
        await sleep(600 * (i + 1))
      }
    }
    throw lastErr
  }

  ipcMain.handle('jdk:fetchVendors', async () => jdkVendors.map((v) => ({ id: v.id, name: v.name })))

  ipcMain.handle('jdk:fetchVersions', async (_event, vendorId?: string) => {
    const vendor = jdkVendors.find((v) => v.id === (vendorId || 'eclipse')) ?? jdkVendors[1]
    try {
      let items: any[] = []
      const baseParams = {
        distribution: vendor.distribution,
        operating_system: 'windows',
        archive_type: 'zip',
        package_type: 'jdk',
        latest: 'available',
        release_status: 'ga'
      }
      // BellSoft often uses amd64, others are usually x64.
      const archCandidates = vendor.id === 'bellsoft' ? ['amd64', 'x64'] : ['x64', 'amd64']
      let lastErr: any
      for (const arch of archCandidates) {
        try {
          items = await fetchFoojayPackages({ ...baseParams, architecture: arch }, 3)
          if (items.length) break
        } catch (e: any) {
          lastErr = e
        }
      }
      if (!items.length && vendor.id === 'eclipse') {
        // Fallback for Eclipse vendor: Adoptium API
        try {
          const releasesRes = await axios.get('https://api.adoptium.net/v3/info/available_releases', { timeout: 10000 })
          const ltsVersions = [...(releasesRes.data.available_lts_releases as number[])].reverse()
          const fallbackResults: any[] = []
          for (const major of ltsVersions) {
            try {
              const r = await axios.get(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot`, {
                params: { architecture: 'x64', image_type: 'jdk', os: 'windows', vendor: 'eclipse' },
                timeout: 10000
              })
              const first = (r.data as any[])?.[0]
              if (!first) continue
              fallbackResults.push({
                version: `${first.version.major}.${first.version.minor}.${first.version.security}`,
                lts: true,
                major,
                filename: first.binary.package.name,
                downloadUrls: {
                  official: first.binary.package.link,
                  aliyun: first.binary.package.link,
                  huawei: first.binary.package.link,
                  tencent: first.binary.package.link
                }
              })
            } catch {}
          }
          if (fallbackResults.length) {
            log.info(`[jdk versions] vendor=${vendor.id} foojay失败，adoptium回退成功 ${fallbackResults.length} 个版本`)
            return fallbackResults
          }
        } catch {}
      }
      if (!items.length && lastErr) throw lastErr

      const list = items
        .filter((i) => i?.links?.pkg_download_redirect && i?.filename)
        .sort((a, b) => Number(b.major_version || 0) - Number(a.major_version || 0))
        .slice(0, 20)
        .map((i) => {
          const version = String(i.distribution_version || i.java_version || i.major_version)
          const filename = String(i.filename)
          const officialUrl = String(i.links.pkg_download_redirect)
          const major = Number(i.major_version || 0)
          const tsinghuaAdoptium = `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jdk/x64/windows/${filename}`
          const ustcAdoptium = `https://mirrors.ustc.edu.cn/adoptium/${major}/jdk/x64/windows/${filename}`
          const isEclipseTemurin = vendor.id === 'eclipse'
          return {
            version,
            lts: i.term_of_support === 'lts',
            major,
            filename,
            downloadUrls: {
              official: officialUrl,
              // For Temurin, provide domestic mirrors first; final selection still goes through reachability probe.
              aliyun: isEclipseTemurin ? tsinghuaAdoptium : officialUrl,
              huawei: isEclipseTemurin ? ustcAdoptium : officialUrl,
              tencent: isEclipseTemurin ? tsinghuaAdoptium : officialUrl
            }
          }
        })
      log.info(`[jdk versions] vendor=${vendor.id} 成功，共 ${list.length} 个版本`)
      return list
    } catch (e: any) {
      log.warn(`[jdk versions] vendor=${vendor.id} 获取失败: ${e.message}`)
      return []
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

  ipcMain.handle('nodejs:fetchVersions', async () => {
    const urls = [
      'https://nodejs.org/dist/index.json',
      'https://mirrors.aliyun.com/nodejs-release/index.json',
      'https://repo.huaweicloud.com/nodejs/index.json',
      'https://mirrors.cloud.tencent.com/nodejs-release/index.json'
    ]
    for (const url of urls) {
      try {
        log.info(`[nodejs versions] 尝试: ${url}`)
        const res = await axios.get(url, { timeout: 6000 })
        const list = (res.data as any[])
          .filter((v) => Array.isArray(v.files) && v.files.includes('win-x64-zip'))
          .slice(0, 30)
          .map((v) => ({
            version: v.version.replace(/^v/, ''),
            date: v.date as string,
            lts: v.lts as string | false,
            npm: v.npm as string
          }))
        log.info(`[nodejs versions] 成功，共 ${list.length} 个版本，来源: ${url}`)
        return list
      } catch (e: any) {
        log.warn(`[nodejs versions] 失败: ${url} — ${e.message}`)
      }
    }
    return []
  })

  ipcMain.handle('git:fetchVersions', async () => {
    const MONTH: Record<string, string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
    }
    function normalizeDate(raw: string): string {
      const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
      if (m) return `${m[3]}-${MONTH[m[2]] ?? '01'}-${m[1]}`
      return raw
    }
    function buildUrls(tag: string, version: string) {
      const file = `Git-${version}-64-bit.exe`
      return {
        filename: file,
        downloadUrls: {
          official: `https://github.com/git-for-windows/git/releases/download/${tag}/${file}`,
          aliyun:   `https://mirrors.aliyun.com/git-for-windows/${tag}/${file}`,
          huawei:   `https://repo.huaweicloud.com/git-for-windows/${tag}/${file}`,
          tencent:  `https://mirrors.cloud.tencent.com/git-for-windows/${tag}/${file}`
        }
      }
    }

    // primary: Huawei mirror directory listing (has dates)
    try {
      const res = await axios.get<string>('https://repo.huaweicloud.com/git-for-windows/', { timeout: 6000 })
      const html = res.data as string
      // href="v2.47.1.windows.2/"  ...  07-Apr-2025  or  2025-04-07
      const lineRe = /href="(v(\d+\.\d+\.\d+)\.windows\.(\d+))\/[^"]*"[^\n]*?(\d{2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/g
      const versionMap: Record<string, { tag: string; date: string; winNum: number }> = {}
      let m: RegExpExecArray | null
      while ((m = lineRe.exec(html)) !== null) {
        const [, tag, ver, winStr, rawDate] = m
        const winNum = parseInt(winStr)
        if (!versionMap[ver] || winNum > versionMap[ver].winNum)
          versionMap[ver] = { tag, date: normalizeDate(rawDate), winNum }
      }
      const sorted = Object.keys(versionMap).sort((a, b) => {
        const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
        for (let i = 0; i < 3; i++) if ((pb[i]??0) !== (pa[i]??0)) return (pb[i]??0)-(pa[i]??0)
        return 0
      }).slice(0, 15)
      if (sorted.length) {
        log.info(`[git versions] Huawei mirror 成功，${sorted.length} 个版本`)
        return sorted.map((ver) => {
          const { tag, date } = versionMap[ver]
          return { version: ver, date, lts: false, ...buildUrls(tag, ver) }
        })
      }
    } catch (e: any) {
      log.warn(`[git versions] Huawei mirror 失败: ${e.message}`)
    }

    // fallback: GitHub releases API
    try {
      const res = await axios.get<any[]>(
        'https://api.github.com/repos/git-for-windows/git/releases?per_page=20',
        { timeout: 8000, headers: { 'User-Agent': 'dev-tool-manage' } }
      )
      const list = res.data
        .filter((r) => !r.prerelease && /^v\d+\.\d+\.\d+\.windows\.\d+$/.test(r.tag_name))
        .slice(0, 15)
        .map((r) => {
          const tag = r.tag_name as string
          const ver = tag.replace(/^v/, '').replace(/\.windows\.\d+$/, '')
          return { version: ver, date: (r.published_at as string)?.slice(0, 10) ?? '', lts: false, ...buildUrls(tag, ver) }
        })
      log.info(`[git versions] GitHub API 成功，${list.length} 个版本`)
      return list
    } catch (e: any) {
      log.warn(`[git versions] GitHub API 失败: ${e.message}`)
    }

    return []
  })

  async function fetchNpmPackageVersions(pkgName: string): Promise<Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<string, string> }>> {
    try {
      const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`
      log.info(`[npm versions] 尝试: ${url}`)
      const res = await axios.get<any>(url, { timeout: 8000 })
      const data = res.data ?? {}
      const timeMap = (data.time ?? {}) as Record<string, string>
      const versions = Object.keys(data.versions ?? {})
        .filter((v) => /^\d+\.\d+\.\d+([-.].+)?$/.test(v))
        .sort((a, b) => {
          const pa = a.split(/[.-]/).map((x) => (Number.isNaN(Number(x)) ? -1 : Number(x)))
          const pb = b.split(/[.-]/).map((x) => (Number.isNaN(Number(x)) ? -1 : Number(x)))
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const da = pa[i] ?? 0
            const db = pb[i] ?? 0
            if (db !== da) return db - da
          }
          return 0
        })
        .slice(0, 30)

      const list = versions.slice(0, 15).map((v) => ({
        version: v,
        date: (timeMap[v] ?? '').slice(0, 10),
        lts: false as const,
        filename: `install-${pkgName.replace('/', '-')}-${v}`,
        downloadUrls: {
          official: `npm:${pkgName}@${v}`,
          aliyun: `npm:${pkgName}@${v}`,
          huawei: `npm:${pkgName}@${v}`,
          tencent: `npm:${pkgName}@${v}`
        }
      }))
      log.info(`[npm versions] 成功，${pkgName} 共 ${list.length} 个版本`)
      return list
    } catch (e: any) {
      log.warn(`[npm versions] 失败，${pkgName}: ${e.message}`)
      return []
    }
  }

  ipcMain.handle('codex:fetchVersions', async () => fetchNpmPackageVersions('@openai/codex'))
  ipcMain.handle('claudeCode:fetchVersions', async () => fetchNpmPackageVersions('@anthropic-ai/claude-code'))

  const npmRegistries = [
    { name: 'npm 官方源', url: 'https://registry.npmjs.org/' },
    { name: '淘宝 npmmirror', url: 'https://registry.npmmirror.com/' },
    { name: '腾讯云镜像', url: 'https://mirrors.cloud.tencent.com/npm/' },
    { name: '华为云镜像', url: 'https://repo.huaweicloud.com/repository/npm/' }
  ]

  ipcMain.handle('npmRegistry:get', async () => {
    try {
      const { stdout } = await execAsync('npm config get registry')
      return (stdout || '').trim()
    } catch {
      return ''
    }
  })

  ipcMain.handle('npmRegistry:list', async () => {
    const current = await (async () => {
      try {
        const { stdout } = await execAsync('npm config get registry')
        return (stdout || '').trim()
      } catch {
        return ''
      }
    })()
    const results = await Promise.all(
      npmRegistries.map(async (item) => {
        const start = Date.now()
        const pingUrl = `${item.url.replace(/\/+$/, '')}/-/ping`
        try {
          await axios.get(pingUrl, { timeout: 3000, validateStatus: (s) => s < 400 })
          return { ...item, ok: true, latency: Date.now() - start, current: current === item.url || current === item.url.replace(/\/+$/, '') }
        } catch {
          return { ...item, ok: false, latency: null, current: current === item.url || current === item.url.replace(/\/+$/, '') }
        }
      })
    )
    return results
  })

  ipcMain.handle('npmRegistry:set', async (_event, url: string) => {
    const safeUrl = String(url || '').trim()
    if (!safeUrl.startsWith('http')) throw new Error('无效的 npm 源地址')
    await execAsync(`npm config set registry "${safeUrl}"`)
    return true
  })

  ipcMain.handle('dialog:selectDir', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择安装目录',
      defaultPath: defaultPath ?? 'C:\\',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
