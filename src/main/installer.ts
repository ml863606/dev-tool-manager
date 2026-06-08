import { spawn, exec } from 'child_process'
import { ensureDir, move, pathExists, remove } from 'fs-extra'
import { join, extname } from 'path'
import { promisify } from 'util'
import AdmZip from 'adm-zip'
import { TOOLS_CONFIG } from '../shared/tools.config'
import log from 'electron-log'
import type { ToolConfig } from '../shared/types'

const execAsync = promisify(exec)

function runProcess(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'pipe', windowsHide: true })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`进程退出码: ${code}`))
    })
    child.on('error', reject)
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await ensureDir(destDir)
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(destDir, true)
}

export async function installTool(
  toolId: string,
  filePath: string,
  installBaseDir: string,
  onStatus: (msg: string) => void,
  toolConfig?: ToolConfig
): Promise<{ success: boolean; installPath: string; error?: string }> {
  const config = toolConfig ?? TOOLS_CONFIG.find((t) => t.id === toolId)
  if (!config) {
    return { success: false, installPath: '', error: `找不到工具配置: ${toolId}` }
  }

  const installPath = join(installBaseDir, toolId)
  await ensureDir(installPath)

  try {
    if (filePath.startsWith('npm:')) {
      const pkg = filePath.replace('npm:', '')
      onStatus(`正在通过 npm 全局安装 ${pkg}...`)
      await execAsync(`npm install -g ${pkg}`)
      onStatus('npm 安装完成')
      return { success: true, installPath: 'global' }
    }

    const ext = extname(filePath).toLowerCase()

    if (ext === '.zip') {
      onStatus(`正在解压到 ${installPath}...`)
      await extractZip(filePath, installPath)

      const { readdirSync, statSync } = await import('fs')
      const entries = readdirSync(installPath)
      if (entries.length === 1) {
        const subDir = join(installPath, entries[0])
        if (statSync(subDir).isDirectory()) {
          const tmpDir = installPath + '_tmp'
          await move(subDir, tmpDir)
          await remove(installPath)
          await move(tmpDir, installPath)
        }
      }

      onStatus('解压完成，正在配置环境变量...')
      await configureEnvVar(toolId, installPath, config.pathAppend)
      return { success: true, installPath }
    }

    if (ext === '.exe') {
      onStatus(`正在执行安装程序...`)
      const args = [...(config.installArgs ?? []), `/DIR=${installPath}`]
      await runProcess(filePath, args)
      onStatus('安装完成')
      return { success: true, installPath }
    }

    if (ext === '.msi') {
      onStatus(`正在执行 MSI 安装...`)
      await runProcess('msiexec', ['/i', filePath, '/qn', `/INSTALLDIR=${installPath}`])
      onStatus('安装完成')
      return { success: true, installPath }
    }

    return { success: false, installPath: '', error: `不支持的安装包格式: ${ext}` }
  } catch (err: any) {
    log.error(`安装 ${toolId} 失败:`, err)
    return { success: false, installPath: '', error: err.message }
  }
}

async function configureEnvVar(
  toolId: string,
  installPath: string,
  pathAppend?: string
): Promise<void> {
  const binPath = pathAppend ? join(installPath, pathAppend) : installPath
  const exists = await pathExists(binPath)
  if (!exists) return

  try {
    const { stdout: currentPath } = await execAsync(
      `powershell -Command "[Environment]::GetEnvironmentVariable('PATH', 'Machine')"`
    )
    const cleanPath = currentPath.trim()

    if (!cleanPath.includes(binPath)) {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('PATH', '${cleanPath};${binPath}', 'Machine')"`
      )
    }

    if (toolId.startsWith('jdk')) {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('JAVA_HOME', '${installPath}', 'Machine')"`
      )
    } else if (toolId === 'maven') {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('MAVEN_HOME', '${installPath}', 'Machine')"`
      )
    } else if (toolId === 'python') {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('PYTHON_HOME', '${installPath}', 'Machine')"`
      )
    } else if (toolId === 'mysql') {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('MYSQL_HOME', '${installPath}', 'Machine')"`
      )
    } else if (toolId === 'redis') {
      await execAsync(
        `powershell -Command "[Environment]::SetEnvironmentVariable('REDIS_HOME', '${installPath}', 'Machine')"`
      )
    }
  } catch (err) {
    log.warn('配置环境变量失败（可能需要管理员权限）:', err)
  }
}

export function extractVersion(raw: string): string {
  const line = raw.split('\n')[0].trim()
  const match = line.match(/\d+\.\d+[\d.]*/)
  return match ? match[0] : line.slice(0, 40)
}

export async function verifyInstall(verifyCommand?: string): Promise<string | null> {
  if (!verifyCommand) return null
  try {
    const { stdout, stderr } = await execAsync(verifyCommand, { timeout: 5000 })
    const raw = (stdout || stderr).trim()
    return raw || null
  } catch {
    return null
  }
}

export async function findCommandPath(
  verifyCommand?: string
): Promise<{ exePath: string | null; allPaths: string[] }> {
  if (!verifyCommand) return { exePath: null, allPaths: [] }
  const bin = verifyCommand.split(' ')[0]

  // 方法1: where
  try {
    const { stdout } = await execAsync(`where ${bin}`, { timeout: 3000 })
    const allPaths = stdout.trim().replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
    if (allPaths.length) return { exePath: allPaths[0], allPaths }
  } catch {}

  // 方法2: PowerShell Get-Command（where 失效时兜底）
  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "(Get-Command ${bin} -ErrorAction SilentlyContinue).Source"`,
      { timeout: 5000 }
    )
    const exePath = stdout.trim().replace(/\r/g, '')
    if (exePath) return { exePath, allPaths: [exePath] }
  } catch {}

  // 方法3: cmd for 循环搜 PATH（最后手段）
  try {
    const { stdout } = await execAsync(
      `cmd /c for %i in (${bin}.exe ${bin}.cmd ${bin}) do @if exist "%~$PATH:i" echo %~$PATH:i`,
      { timeout: 4000 }
    )
    const exePath = stdout.trim().replace(/\r/g, '').split('\n')[0].trim()
    if (exePath) return { exePath, allPaths: [exePath] }
  } catch {}

  return { exePath: null, allPaths: [] }
}
