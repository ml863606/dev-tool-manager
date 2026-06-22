import { ipcMain, shell, dialog } from 'electron'
import axios from 'axios'
import { basename, dirname, extname, join } from 'path'
import { randomBytes } from 'crypto'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { closeSync, existsSync, openSync, readSync, statSync, unlinkSync } from 'fs'
import log from 'electron-log'
import Store from 'electron-store'
import { TOOLS_CONFIG, DEFAULT_SETTINGS } from '../shared/tools.config'
import { downloader } from './downloader'
import { installTool, verifyInstall, findCommandPath, extractVersion } from './installer'
import { resolveBestDownloadUrl, detectBestMirror, probeAll } from './network'
import { loadTaskCache, loadToolsCatalog, saveTaskCache, saveToolsCatalog, upsertTask } from './task-db'
import { registerMysqlHandlers } from './db/mysql'
import { registerRedisHandlers } from './db/redis'
import { registerJdkHandlers } from './backend/jdk'
import { registerMavenHandlers } from './backend/maven'
import { registerPythonHandlers } from './backend/python'
import { sendToRenderer } from './ipc-utils'
import type { AppSettings, DownloadTask, InstalledTool, IpcDownloadPayload, ToolConfig } from '../shared/types'
const execAsync = promisify(exec)

function generateId(): string {
  return randomBytes(4).toString('hex')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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

function isValidCachedPackage(filePath: string): boolean {
  if (extname(filePath).toLowerCase() !== '.zip') return true
  return isValidZipFile(filePath)
}

function runLoggedProcess(
  command: string,
  args: string[],
  cwd: string,
  onLog: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    onLog(`> ${command} ${args.join(' ')}`)
    const outputTail: string[] = []
    const pushOutput = (line: string) => {
      outputTail.push(line)
      if (outputTail.length > 8) outputTail.shift()
      onLog(line)
    }
    const decodeChunk = (chunk: Buffer) => {
      if (process.platform !== 'win32') return chunk.toString()
      try {
        return new TextDecoder('gb18030').decode(chunk)
      } catch {
        return chunk.toString()
      }
    }
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false })
    child.stdout.on('data', (chunk) => {
      decodeChunk(chunk).split(/\r?\n/).filter(Boolean).forEach(pushOutput)
    })
    child.stderr.on('data', (chunk) => {
      decodeChunk(chunk).split(/\r?\n/).filter(Boolean).forEach(pushOutput)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const detail = outputTail.length ? `, recent output: ${outputTail.join(' | ')}` : ''
        reject(new Error(`${basename(command)} exit code: ${code}${detail}`))
      }
    })
  })
}

async function isWindowsElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  try {
    await execAsync('net session', { timeout: 3000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

async function checkPortUsage(port: number): Promise<{ available: boolean; port: number; pid?: number; processName?: string; path?: string; state?: string }> {
  const safePort = Number(port)
  if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) {
    return { available: false, port: safePort, state: 'invalid' }
  }
  try {
    const ps = [
      `$conn = Get-NetTCPConnection -LocalPort ${safePort} -ErrorAction SilentlyContinue | Select-Object -First 1;`,
      `if ($null -eq $conn) { Write-Output '{"available":true,"port":${safePort}}'; exit }`,
      `$proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue;`,
      `$result = [ordered]@{ available=$false; port=${safePort}; pid=$conn.OwningProcess; state=[string]$conn.State; processName=$proc.ProcessName; path=$proc.Path };`,
      `$result | ConvertTo-Json -Compress`
    ].join(' ')
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 3000 })
    return JSON.parse(stdout.trim())
  } catch (err: any) {
    log.warn(`[port check] 端口 ${safePort} 检测失败: ${err?.message ?? err}`)
    return { available: true, port: safePort }
  }
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
  function applyGithubProxy(url: string): string {
    const settings = store.get('settings') as AppSettings
    const prefix = (settings.githubProxyPrefix || DEFAULT_SETTINGS.githubProxyPrefix).trim().replace(/\/+$/, '')
    if (!prefix || !/^https?:\/\/github\.com\//i.test(url)) return url
    return `${prefix}/${url.replace(/^https?:\/\//i, '')}`
  }

  async function resolveDownloadUrl(url: string): Promise<string> {
    const proxiedUrl = applyGithubProxy(url)
    if (proxiedUrl !== url) {
      log.info(`[download] GitHub 镜像加速: ${proxiedUrl}`)
      return proxiedUrl
    }
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
        return applyGithubProxy(location)
      }
      return url
    } catch (e: any) {
      const location = String(e?.response?.headers?.location ?? '').trim()
      if (location) {
        log.info(`[download] foojay redirect resolved(from error): ${location}`)
        return applyGithubProxy(location)
      }
      log.warn(`[download] resolve redirect failed, fallback original: ${e?.message ?? e}`)
      return url
    }
  }

  async function getToolsCatalog(): Promise<ToolConfig[]> {
    const fromDb = await loadToolsCatalog()
    const hasLatestTools = TOOLS_CONFIG.every((tool) => fromDb.some((cached) => cached.id === tool.id))
    const hasLatestVersions = TOOLS_CONFIG.every((tool) => {
      const cached = fromDb.find((item) => item.id === tool.id)
      return cached && JSON.stringify(cached.versions) === JSON.stringify(tool.versions)
    })
    if (fromDb.length > 0 && hasLatestTools && hasLatestVersions) return fromDb
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
      sendToRenderer(mainWindow, 'tools:detectProgress', {
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
        sendToRenderer(mainWindow, 'tools:detectProgress', {
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
        sendToRenderer(mainWindow, 'tools:detectProgress', {
          toolId: tool.id,
          toolName: tool.name,
          status: 'not_found'
        })
      }
    }

    if (changed) store.set('installed', installed)

    sendToRenderer(mainWindow, 'tools:detectProgress', { status: 'done' })

    return toolsCatalog.map((tool) => ({
      ...tool,
      installed: installed[tool.id] ?? null
    }))
  })

  ipcMain.handle('settings:get', () => {
    const settings = store.get('settings') as AppSettings
    const shouldMigrateGithubProxy = !settings.githubProxyPrefix || settings.githubProxyPrefix.replace(/\/+$/, '') === 'https://gh.zwy.one'
    if (settings.preferredMirror === 'auto' || shouldMigrateGithubProxy) {
      const next = {
        ...settings,
        preferredMirror: settings.preferredMirror === 'auto' ? DEFAULT_SETTINGS.preferredMirror : settings.preferredMirror,
        githubProxyPrefix: shouldMigrateGithubProxy ? DEFAULT_SETTINGS.githubProxyPrefix : settings.githubProxyPrefix
      }
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

  ipcMain.handle('network:checkPort', async (_event, port: number) => {
    return checkPortUsage(port)
  })

  ipcMain.handle('network:listPorts', async () => {
    try {
      const { stdout } = await execAsync('netstat -ano -p tcp', { timeout: 5000, maxBuffer: 1024 * 1024 * 8 })
      const rows = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('TCP'))
        .map((line) => {
          const parts = line.split(/\s+/)
          const local = parts[1] ?? ''
          const remote = parts[2] ?? ''
          const state = parts[3] ?? ''
          const pid = Number(parts[4] ?? 0)
          const localPort = Number(local.slice(local.lastIndexOf(':') + 1))
          const remotePort = Number(remote.slice(remote.lastIndexOf(':') + 1))
          return {
            port: localPort,
            localAddress: local.slice(0, local.lastIndexOf(':')),
            remoteAddress: remote.slice(0, remote.lastIndexOf(':')),
            remotePort: Number.isFinite(remotePort) ? remotePort : 0,
            state,
            pid
          }
        })
        .filter((row) => Number.isFinite(row.port) && row.port > 0)

      const pids = [...new Set(rows.map((row) => row.pid).filter(Boolean))]
      let processMap: Record<string, { processName?: string; path?: string }> = {}
      if (pids.length) {
        try {
          const ps = [
            `$ids = @(${pids.join(',')});`,
            `$ids | ForEach-Object {`,
            `  $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue;`,
            `  if ($proc) { [ordered]@{ pid=[int]$proc.Id; processName=[string]$proc.ProcessName; path=[string]$proc.Path } }`,
            `} | ConvertTo-Json -Compress`
          ].join(' ')
          const { stdout: procOut } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 5000, maxBuffer: 1024 * 1024 * 4 })
          const raw = procOut.trim()
          const parsed = raw ? JSON.parse(raw) : []
          const list = Array.isArray(parsed) ? parsed : [parsed]
          processMap = Object.fromEntries(list.map((item) => [String(item.pid), { processName: item.processName, path: item.path }]))
        } catch (err: any) {
          log.warn(`[port list] 获取进程信息失败: ${err?.message ?? err}`)
        }
      }

      return rows
        .map((row) => ({ ...row, ...(processMap[String(row.pid)] ?? {}) }))
        .sort((a, b) => a.port - b.port || a.pid - b.pid)
    } catch (err: any) {
      log.warn(`[port list] 获取端口占用失败: ${err?.message ?? err}`)
      return []
    }
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
    if (payload.forceDownload && existsSync(cachedFilePath)) {
      log.info(`[download:start] force download, overwrite cached package: ${cachedFilePath}`)
      unlinkSync(cachedFilePath)
    }
    if (
      !versionConfig.downloadUrls[settings.preferredMirror === 'auto' ? 'huawei' : settings.preferredMirror]?.startsWith('npm:')
      && existsSync(cachedFilePath)
      && !isValidCachedPackage(cachedFilePath)
    ) {
      log.warn(`[download:start] invalid cached package removed: ${cachedFilePath}`)
      unlinkSync(cachedFilePath)
    }
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
      sendToRenderer(mainWindow, 'download:progress', cachedTask)
      await upsertTask(cachedTask)
      sendToRenderer(mainWindow, 'install:status', { taskId, msg: `检测到本地缓存，跳过下载: ${cachedFilePath}` })
      if (payload.downloadOnly || payload.toolId === 'mysql') {
        return taskId
      }
      const result = await installTool(
        payload.toolId,
        cachedFilePath,
        settings.installBaseDir,
        (msg) => sendToRenderer(mainWindow, 'install:status', { taskId, msg }),
        toolConfig,
        payload.installDir
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
      }
      sendToRenderer(mainWindow, 'install:complete', {
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

    sendToRenderer(mainWindow, 'download:progress', task)
    await upsertTask(task)

    if (finalUrl.startsWith('npm:')) {
      const result = await installTool(
        payload.toolId,
        finalUrl,
        settings.installBaseDir,
        (msg) => sendToRenderer(mainWindow, 'install:status', { taskId, msg }),
        toolConfig,
        payload.installDir
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
        const doneTask = {
          ...task,
          status: 'completed' as const,
          progress: 100,
          completedAt: new Date().toISOString()
        }
        sendToRenderer(mainWindow, 'download:progress', doneTask)
        await upsertTask(doneTask)
        sendToRenderer(mainWindow, 'install:complete', {
          taskId,
          toolId: payload.toolId,
          success: true,
          installPath: result.installPath
        })
      } else {
        const failedTask = {
          ...task,
          status: 'error' as const,
          error: result.error ?? 'npm 安装失败',
          completedAt: new Date().toISOString()
        }
        sendToRenderer(mainWindow, 'download:progress', failedTask)
        await upsertTask(failedTask)
        sendToRenderer(mainWindow, 'install:complete', {
          taskId,
          toolId: payload.toolId,
          success: false,
          error: result.error
        })
      }
      return taskId
    }

    downloader
      .download(taskId, finalUrl, downloadDir, versionConfig.filename, (patch) => {
        if (patch.status === 'completed') patch.completedAt = new Date().toISOString()
        const updatedTask = { ...task, ...patch } as DownloadTask
        sendToRenderer(mainWindow, 'download:progress', updatedTask)
        void upsertTask(updatedTask)
        if (patch.filePath) task.filePath = patch.filePath
      })
      .then(async (filePath) => {
        if (payload.downloadOnly) {
          sendToRenderer(mainWindow, 'install:complete', {
            taskId,
            toolId: payload.toolId,
            success: true,
            downloadOnly: true,
            filePath
          })
          return
        }
        sendToRenderer(mainWindow, 'install:status', { taskId, msg: '下载完成，准备安装...' })
        const result = await installTool(
          payload.toolId,
          filePath,
          settings.installBaseDir,
          (msg) => sendToRenderer(mainWindow, 'install:status', { taskId, msg }),
          toolConfig,
          payload.installDir
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
          sendToRenderer(mainWindow, 'install:complete', {
            taskId,
            toolId: payload.toolId,
            success: true,
            installPath: result.installPath
          })
        } else {
          sendToRenderer(mainWindow, 'install:complete', {
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

  ipcMain.handle('download:openDirOfFile', (_event, filePath: string) => {
    return shell.openPath(dirname(filePath))
  })

  ipcMain.handle('download:findCached', async (_event, filename: string) => {
    const settings = store.get('settings') as AppSettings
    const downloadDir = settings.downloadDir || join(settings.installBaseDir, '_downloads')
    const filePath = join(downloadDir, filename)
    if (existsSync(filePath)) {
      if (!isValidCachedPackage(filePath)) return null
      const stat = statSync(filePath)
      return { filePath, size: formatBytes(stat.size) }
    }

    const cache = await loadTaskCache()
    for (const [, task] of cache.downloadTasks) {
      if (task.filePath && basename(task.filePath) === filename && existsSync(task.filePath)) {
        if (!isValidCachedPackage(task.filePath)) continue
        const stat = statSync(task.filePath)
        return { filePath: task.filePath, size: formatBytes(stat.size) }
      }
    }
    return null
  })

  registerMavenHandlers({
    mainWindow,
    store,
    getToolsCatalog,
    generateId,
    formatBytes
  })
  registerPythonHandlers()
  registerJdkHandlers()

  registerMysqlHandlers({
    mainWindow,
    store,
    getToolsCatalog,
    generateId,
    formatBytes,
    checkPortUsage,
    isWindowsElevated,
    runLoggedProcess,
    execAsync
  })
  registerRedisHandlers({
    mainWindow,
    store,
    getToolsCatalog,
    generateId,
    formatBytes,
    checkPortUsage,
    isWindowsElevated,
    runLoggedProcess,
    execAsync
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
