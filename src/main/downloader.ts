import axios from 'axios'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import { createWriteStream, existsSync, statSync } from 'fs'
import { ensureDir } from 'fs-extra'
import { join } from 'path'
import { EventEmitter } from 'events'
import type { DownloadTask } from '../shared/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export class Downloader extends EventEmitter {
  private controllers = new Map<string, AbortController>()
  private aria2Processes = new Map<string, ChildProcessWithoutNullStreams>()
  private pausedTasks = new Set<string>()

  async download(
    taskId: string,
    url: string,
    destDir: string,
    filename: string,
    onProgress: (patch: Partial<DownloadTask>) => void
  ): Promise<string> {
    await ensureDir(destDir)
    try {
      return await this.downloadWithAria2(taskId, url, destDir, filename, onProgress)
    } catch (err: any) {
      if (err?.message === '下载已暂停') throw err
      onProgress({ status: 'downloading', speed: '回退到内置下载器' })
      return this.downloadWithAxios(taskId, url, destDir, filename, onProgress)
    }
  }

  private resolveAria2Path(): string | null {
    const candidates = [
      join(process.cwd(), 'resources', 'aria2', 'aria2c.exe'),
      join(app.getAppPath(), 'resources', 'aria2', 'aria2c.exe'),
      join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'aria2', 'aria2c.exe'),
      join(process.resourcesPath, 'resources', 'aria2', 'aria2c.exe'),
      join(process.resourcesPath, 'aria2', 'aria2c.exe')
    ]
    return candidates.find((item) => existsSync(item)) ?? null
  }

  private async downloadWithAria2(
    taskId: string,
    url: string,
    destDir: string,
    filename: string,
    onProgress: (patch: Partial<DownloadTask>) => void
  ): Promise<string> {
    const aria2Path = this.resolveAria2Path()
    if (!aria2Path) throw new Error('aria2c.exe not found')

    const filePath = join(destDir, filename)
    const startedAt = Date.now()
    let lastBytes = existsSync(filePath) ? statSync(filePath).size : 0
    let lastTime = startedAt
    let totalBytes = 0
    let stderrTail: string[] = []

    onProgress({ status: 'downloading', speed: 'aria2 启动中' })
    const child = spawn(aria2Path, [
      '--allow-overwrite=true',
      '--auto-file-renaming=false',
      '--continue=true',
      '--max-connection-per-server=16',
      '--split=16',
      '--min-split-size=1M',
      '--file-allocation=none',
      '--summary-interval=0',
      '--console-log-level=warn',
      '--download-result=hide',
      '--dir', destDir,
      '--out', filename,
      url
    ], { windowsHide: true })
    this.aria2Processes.set(taskId, child)

    const progressTimer = setInterval(() => {
      const current = existsSync(filePath) ? statSync(filePath).size : 0
      const now = Date.now()
      const elapsed = Math.max((now - lastTime) / 1000, 0.001)
      const speed = (current - lastBytes) / elapsed
      lastBytes = current
      lastTime = now
      onProgress({
        status: 'downloading',
        progress: totalBytes ? Math.min(99, Math.floor((current / totalBytes) * 100)) : 0,
        downloadedSize: formatBytes(current),
        totalSize: totalBytes ? formatBytes(totalBytes) : '未知',
        speed: formatSpeed(Math.max(speed, 0))
      })
    }, 500)

    const collectOutput = (chunk: Buffer) => {
      const text = chunk.toString()
      const lengthMatch = text.match(/Length:\s*([0-9]+)/i)
      if (lengthMatch) totalBytes = Number(lengthMatch[1])
      stderrTail = [...stderrTail, ...text.split(/\r?\n/).filter(Boolean)].slice(-8)
    }
    child.stdout.on('data', collectOutput)
    child.stderr.on('data', collectOutput)

    return new Promise((resolve, reject) => {
      child.on('error', (err) => {
        clearInterval(progressTimer)
        this.aria2Processes.delete(taskId)
        reject(err)
      })
      child.on('close', (code) => {
        clearInterval(progressTimer)
        this.aria2Processes.delete(taskId)
        if (this.pausedTasks.has(taskId)) {
          this.pausedTasks.delete(taskId)
          onProgress({ status: 'paused' })
          reject(new Error('下载已暂停'))
          return
        }
        if (code === 0 && existsSync(filePath)) {
          const size = statSync(filePath).size
          onProgress({
            status: 'completed',
            progress: 100,
            filePath,
            downloadedSize: formatBytes(size),
            totalSize: formatBytes(size),
            speed: '0 B/s'
          })
          resolve(filePath)
          return
        }
        const detail = stderrTail.length ? `: ${stderrTail.join(' | ')}` : ''
        reject(new Error(`aria2 下载失败，退出码 ${code}${detail}`))
      })
    })
  }

  private async downloadWithAxios(
    taskId: string,
    url: string,
    destDir: string,
    filename: string,
    onProgress: (patch: Partial<DownloadTask>) => void
  ): Promise<string> {
    const filePath = join(destDir, filename)
    const controller = new AbortController()
    this.controllers.set(taskId, controller)

    let lastTime = Date.now()
    let lastBytes = 0

    let response: Awaited<ReturnType<typeof axios.get>>
    try {
      response = await axios.get(url, {
        responseType: 'stream',
        signal: controller.signal,
        timeout: 0,
        headers: {
          'User-Agent': 'dev-tool-manage/1.0'
        },
        validateStatus: (s) => s < 400
      })
    } catch (err: any) {
      this.controllers.delete(taskId)
      onProgress({ status: 'error', error: err.message })
      throw err
    }

    const total = parseInt(response.headers['content-length'] ?? '0', 10)
    let downloaded = 0

    return new Promise((resolve, reject) => {
      const fileStream = createWriteStream(filePath)

      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed >= 0.5) {
          const speed = (downloaded - lastBytes) / elapsed
          lastTime = now
          lastBytes = downloaded
          onProgress({
            progress: total ? Math.floor((downloaded / total) * 100) : 0,
            downloadedSize: formatBytes(downloaded),
            totalSize: total ? formatBytes(total) : '未知',
            speed: formatSpeed(speed),
            status: 'downloading'
          })
        }
      })

      response.data.on('error', (err: Error) => {
        this.controllers.delete(taskId)
        if ((err as any).code === 'ERR_CANCELED') {
          onProgress({ status: 'paused' })
          reject(new Error('下载已暂停'))
        } else {
          onProgress({ status: 'error', error: err.message })
          reject(err)
        }
      })

      response.data.pipe(fileStream)

      fileStream.on('finish', () => {
        this.controllers.delete(taskId)
        onProgress({ status: 'completed', progress: 100, filePath })
        resolve(filePath)
      })

      fileStream.on('error', (err) => {
        this.controllers.delete(taskId)
        onProgress({ status: 'error', error: err.message })
        reject(err)
      })
    })
  }

  pause(taskId: string): void {
    this.pausedTasks.add(taskId)
    this.aria2Processes.get(taskId)?.kill()
    this.aria2Processes.delete(taskId)
    this.controllers.get(taskId)?.abort()
    this.controllers.delete(taskId)
  }
}

export const downloader = new Downloader()
