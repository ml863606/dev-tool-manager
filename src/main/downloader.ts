import axios from 'axios'
import { createWriteStream } from 'fs'
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

  async download(
    taskId: string,
    url: string,
    destDir: string,
    filename: string,
    onProgress: (patch: Partial<DownloadTask>) => void
  ): Promise<string> {
    await ensureDir(destDir)
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
    this.controllers.get(taskId)?.abort()
    this.controllers.delete(taskId)
  }
}

export const downloader = new Downloader()
