import { app } from 'electron'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import sqlite3 from 'sqlite3'
import type { DownloadTask, ToolConfig } from '../shared/types'

export interface TaskCachePayload {
  downloadTasks: Array<[string, DownloadTask]>
  installLogs: Array<[string, string[]]>
}

let db: sqlite3.Database | null = null

function resolveDbPath(): string {
  const baseDir = app.isPackaged ? dirname(process.execPath) : process.cwd()
  return join(baseDir, 'db', 'task-cache.db')
}

function openDb(): sqlite3.Database {
  if (db) return db
  const preferredPath = resolveDbPath()
  try {
    mkdirSync(dirname(preferredPath), { recursive: true })
    db = new sqlite3.Database(preferredPath)
    return db
  } catch {
    const fallbackPath = join(app.getPath('userData'), 'db', 'task-cache.db')
    mkdirSync(dirname(fallbackPath), { recursive: true })
    db = new sqlite3.Database(fallbackPath)
    return db
  }
}

function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb().run(sql, params, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function get<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    openDb().get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row as T | undefined)
    })
  })
}

function all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    openDb().all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve((rows as T[]) ?? [])
    })
  })
}

async function transaction(fn: () => Promise<void>): Promise<void> {
  await run('BEGIN TRANSACTION')
  try {
    await fn()
    await run('COMMIT')
  } catch (err) {
    await run('ROLLBACK')
    throw err
  }
}

export async function initTaskDb(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS category (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS software (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      homepage TEXT NOT NULL,
      verify_command TEXT,
      path_append TEXT,
      install_args_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES category(id)
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS software_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      software_id TEXT NOT NULL,
      version TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER,
      sha256 TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(software_id, version),
      FOREIGN KEY (software_id) REFERENCES software(id)
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS software_version_url (
      version_id INTEGER NOT NULL,
      mirror TEXT NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (version_id, mirror),
      FOREIGN KEY (version_id) REFERENCES software_version(id)
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS task (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      speed TEXT NOT NULL,
      total_size TEXT NOT NULL,
      downloaded_size TEXT NOT NULL,
      mirror_used TEXT NOT NULL,
      error TEXT,
      file_path TEXT,
      download_url TEXT,
      started_at TEXT,
      completed_at TEXT
    )
  `)
  await run(`
    CREATE TABLE IF NOT EXISTS task_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      line TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task(id)
    )
  `)
}

export async function loadTaskCache(): Promise<TaskCachePayload> {
  await initTaskDb()
  const taskRows = await all<any>('SELECT * FROM task ORDER BY started_at DESC')
  const logRows = await all<{ task_id: string; line: string; line_no: number }>(
    'SELECT task_id, line, line_no FROM task_log ORDER BY task_id, line_no'
  )

  const downloadTasks: Array<[string, DownloadTask]> = taskRows.map((r) => [
    r.id,
    {
      id: r.id,
      toolId: r.tool_id,
      toolName: r.tool_name,
      version: r.version,
      status: r.status,
      progress: r.progress,
      speed: r.speed,
      totalSize: r.total_size,
      downloadedSize: r.downloaded_size,
      mirrorUsed: r.mirror_used,
      error: r.error ?? undefined,
      filePath: r.file_path ?? undefined,
      downloadUrl: r.download_url ?? undefined,
      startedAt: r.started_at ?? undefined,
      completedAt: r.completed_at ?? undefined
    }
  ])

  const logsMap = new Map<string, string[]>()
  for (const row of logRows) {
    const lines = logsMap.get(row.task_id) ?? []
    lines.push(row.line)
    logsMap.set(row.task_id, lines)
  }

  return { downloadTasks, installLogs: [...logsMap.entries()] }
}

export async function saveTaskCache(payload: TaskCachePayload): Promise<void> {
  await initTaskDb()
  await transaction(async () => {
    await run('DELETE FROM task_log')
    await run('DELETE FROM task')

    for (const [, task] of payload.downloadTasks) {
      await run(
        `
        INSERT INTO task (
          id, tool_id, tool_name, version, status, progress, speed, total_size, downloaded_size, mirror_used,
          error, file_path, download_url, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          task.id,
          task.toolId,
          task.toolName,
          task.version,
          task.status,
          task.progress,
          task.speed,
          task.totalSize,
          task.downloadedSize,
          task.mirrorUsed,
          task.error ?? null,
          task.filePath ?? null,
          task.downloadUrl ?? null,
          task.startedAt ?? null,
          task.completedAt ?? null
        ]
      )
    }

    for (const [taskId, lines] of payload.installLogs) {
      for (let i = 0; i < lines.length; i++) {
        await run('INSERT INTO task_log (task_id, line_no, line) VALUES (?, ?, ?)', [taskId, i, lines[i]])
      }
    }
  })
}

export async function upsertTask(task: DownloadTask): Promise<void> {
  await initTaskDb()
  await run(
    `
    INSERT INTO task (
      id, tool_id, tool_name, version, status, progress, speed, total_size, downloaded_size, mirror_used,
      error, file_path, download_url, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tool_id=excluded.tool_id,
      tool_name=excluded.tool_name,
      version=excluded.version,
      status=excluded.status,
      progress=excluded.progress,
      speed=excluded.speed,
      total_size=excluded.total_size,
      downloaded_size=excluded.downloaded_size,
      mirror_used=excluded.mirror_used,
      error=excluded.error,
      file_path=excluded.file_path,
      download_url=excluded.download_url,
      started_at=excluded.started_at,
      completed_at=excluded.completed_at
  `,
    [
      task.id,
      task.toolId,
      task.toolName,
      task.version,
      task.status,
      task.progress,
      task.speed,
      task.totalSize,
      task.downloadedSize,
      task.mirrorUsed,
      task.error ?? null,
      task.filePath ?? null,
      task.downloadUrl ?? null,
      task.startedAt ?? null,
      task.completedAt ?? null
    ]
  )
}

const CATEGORY_NAME_MAP: Record<string, string> = {
  backend: '后端',
  frontend: '前端',
  ai: 'AI 工具',
  other: '其他'
}

export async function loadToolsCatalog(): Promise<ToolConfig[]> {
  await initTaskDb()
  const categories = await all<{ id: string }>('SELECT id FROM category ORDER BY sort_order, id')
  if (!categories.length) return []

  const softwareRows = await all<any>('SELECT * FROM software ORDER BY sort_order, id')
  const versionRows = await all<any>('SELECT * FROM software_version ORDER BY sort_order, id')
  const urlRows = await all<{ version_id: number; mirror: string; url: string }>(
    'SELECT version_id, mirror, url FROM software_version_url'
  )

  const urlsByVersionId = new Map<number, Record<string, string>>()
  for (const row of urlRows) {
    const urls = urlsByVersionId.get(row.version_id) ?? {}
    urls[row.mirror] = row.url
    urlsByVersionId.set(row.version_id, urls)
  }

  const versionsBySoftware = new Map<string, any[]>()
  for (const row of versionRows) {
    const list = versionsBySoftware.get(row.software_id) ?? []
    list.push({
      version: row.version,
      filename: row.filename,
      size: row.size ?? undefined,
      sha256: row.sha256 ?? undefined,
      downloadUrls: urlsByVersionId.get(row.id) ?? {}
    })
    versionsBySoftware.set(row.software_id, list)
  }

  return softwareRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category_id,
    icon: row.icon,
    homepage: row.homepage,
    verifyCommand: row.verify_command ?? undefined,
    pathAppend: row.path_append ?? undefined,
    installArgs: row.install_args_json ? JSON.parse(row.install_args_json) : undefined,
    versions: versionsBySoftware.get(row.id) ?? []
  })) as ToolConfig[]
}

export async function saveToolsCatalog(catalog: ToolConfig[]): Promise<void> {
  await initTaskDb()
  await transaction(async () => {
    await run('DELETE FROM software_version_url')
    await run('DELETE FROM software_version')
    await run('DELETE FROM software')
    await run('DELETE FROM category')

    const categories = [...new Set(catalog.map((t) => t.category))]
    for (let i = 0; i < categories.length; i++) {
      const id = categories[i]
      await run('INSERT INTO category (id, name, sort_order) VALUES (?, ?, ?)', [id, CATEGORY_NAME_MAP[id] ?? id, i])
    }

    for (let i = 0; i < catalog.length; i++) {
      const tool = catalog[i]
      await run(
        `
        INSERT INTO software (
          id, category_id, name, description, icon, homepage, verify_command, path_append, install_args_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          tool.id,
          tool.category,
          tool.name,
          tool.description,
          tool.icon,
          tool.homepage,
          tool.verifyCommand ?? null,
          tool.pathAppend ?? null,
          tool.installArgs ? JSON.stringify(tool.installArgs) : null,
          i
        ]
      )

      for (let j = 0; j < tool.versions.length; j++) {
        const v = tool.versions[j]
        await run(
          `
          INSERT INTO software_version (software_id, version, filename, size, sha256, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          [tool.id, v.version, v.filename, v.size ?? null, v.sha256 ?? null, j]
        )

        const versionRow = await get<{ id: number }>(
          'SELECT id FROM software_version WHERE software_id = ? AND version = ?',
          [tool.id, v.version]
        )
        if (!versionRow?.id) continue

        for (const [mirror, url] of Object.entries(v.downloadUrls ?? {})) {
          await run('INSERT INTO software_version_url (version_id, mirror, url) VALUES (?, ?, ?)', [
            versionRow.id,
            mirror,
            url
          ])
        }
      }
    }
  })
}
