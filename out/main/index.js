"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const log = require("electron-log");
const axios = require("axios");
const crypto = require("crypto");
const child_process = require("child_process");
const util = require("util");
const Store = require("electron-store");
const fs = require("fs");
const fsExtra = require("fs-extra");
const events = require("events");
const AdmZip = require("adm-zip");
const sqlite3 = require("sqlite3");
const is = {
  dev: !electron.app.isPackaged
};
({
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
});
const TOOLS_CONFIG = [
  {
    id: "jdk",
    name: "JDK",
    description: "Eclipse Temurin OpenJDK（支持 LTS 版本动态获取）",
    category: "backend",
    icon: "java",
    homepage: "https://adoptium.net",
    verifyCommand: "java -version",
    pathAppend: "bin",
    versions: [
      {
        version: "21.0.3",
        filename: "OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip",
        downloadUrls: {
          official: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip",
          aliyun: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip",
          huawei: "https://mirrors.ustc.edu.cn/adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip",
          tencent: "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip"
        }
      }
    ]
  },
  {
    id: "maven",
    name: "Apache Maven",
    description: "Java 项目构建与依赖管理工具",
    category: "backend",
    icon: "maven",
    homepage: "https://maven.apache.org",
    verifyCommand: "mvn --version",
    pathAppend: "bin",
    versions: [
      {
        version: "3.9.9",
        filename: "apache-maven-3.9.9-bin.zip",
        downloadUrls: {
          official: "https://downloads.apache.org/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip",
          aliyun: "https://mirrors.aliyun.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip",
          huawei: "https://repo.huaweicloud.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip",
          tencent: "https://mirrors.cloud.tencent.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip"
        }
      }
    ]
  },
  {
    id: "python",
    name: "Python",
    description: "Python 编程语言运行环境",
    category: "backend",
    icon: "python",
    homepage: "https://www.python.org",
    verifyCommand: "python --version",
    versions: [
      {
        version: "3.12.3",
        filename: "python-3.12.3-amd64.exe",
        downloadUrls: {
          official: "https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe",
          aliyun: "https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe",
          huawei: "https://repo.huaweicloud.com/python/3.12.3/python-3.12.3-amd64.exe",
          tencent: "https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe"
        }
      },
      {
        version: "3.11.9",
        filename: "python-3.11.9-amd64.exe",
        downloadUrls: {
          official: "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe",
          aliyun: "https://mirrors.tuna.tsinghua.edu.cn/python/3.11.9/python-3.11.9-amd64.exe",
          huawei: "https://repo.huaweicloud.com/python/3.11.9/python-3.11.9-amd64.exe",
          tencent: "https://mirrors.tuna.tsinghua.edu.cn/python/3.11.9/python-3.11.9-amd64.exe"
        }
      }
    ],
    installArgs: ["/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_test=0"]
  },
  {
    id: "nodejs",
    name: "Node.js",
    description: "Node.js JavaScript 运行环境",
    category: "frontend",
    icon: "nodejs",
    homepage: "https://nodejs.org",
    verifyCommand: "node --version",
    versions: [
      {
        version: "20.12.2",
        filename: "node-v20.12.2-win-x64.zip",
        downloadUrls: {
          official: "https://nodejs.org/dist/v20.12.2/node-v20.12.2-win-x64.zip",
          aliyun: "https://mirrors.aliyun.com/nodejs-release/v20.12.2/node-v20.12.2-win-x64.zip",
          huawei: "https://repo.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-win-x64.zip",
          tencent: "https://mirrors.cloud.tencent.com/nodejs-release/v20.12.2/node-v20.12.2-win-x64.zip"
        }
      },
      {
        version: "18.20.2",
        filename: "node-v18.20.2-win-x64.zip",
        downloadUrls: {
          official: "https://nodejs.org/dist/v18.20.2/node-v18.20.2-win-x64.zip",
          aliyun: "https://mirrors.aliyun.com/nodejs-release/v18.20.2/node-v18.20.2-win-x64.zip",
          huawei: "https://repo.huaweicloud.com/nodejs/v18.20.2/node-v18.20.2-win-x64.zip",
          tencent: "https://mirrors.cloud.tencent.com/nodejs-release/v18.20.2/node-v18.20.2-win-x64.zip"
        }
      }
    ]
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI 工具",
    category: "ai",
    icon: "claude",
    homepage: "https://claude.ai/code",
    verifyCommand: "claude --version",
    versions: [
      {
        version: "latest",
        filename: "install-claude-code",
        downloadUrls: {
          official: "npm:@anthropic-ai/claude-code",
          aliyun: "npm:@anthropic-ai/claude-code",
          huawei: "npm:@anthropic-ai/claude-code",
          tencent: "npm:@anthropic-ai/claude-code"
        }
      }
    ]
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    description: "OpenAI Codex 命令行工具",
    category: "ai",
    icon: "openai",
    homepage: "https://github.com/openai/codex",
    verifyCommand: "codex --version",
    versions: [
      {
        version: "latest",
        filename: "install-codex",
        downloadUrls: {
          official: "npm:@openai/codex",
          aliyun: "npm:@openai/codex",
          huawei: "npm:@openai/codex",
          tencent: "npm:@openai/codex"
        }
      }
    ]
  },
  {
    id: "git",
    name: "Git",
    description: "分布式版本控制系统",
    category: "other",
    icon: "git",
    homepage: "https://git-scm.com",
    verifyCommand: "git --version",
    versions: [
      {
        version: "2.45.0",
        filename: "Git-2.45.0-64-bit.exe",
        downloadUrls: {
          official: "https://github.com/git-for-windows/git/releases/download/v2.45.0.windows.1/Git-2.45.0-64-bit.exe",
          aliyun: "https://mirrors.aliyun.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe",
          huawei: "https://repo.huaweicloud.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe",
          tencent: "https://mirrors.cloud.tencent.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe"
        }
      }
    ],
    installArgs: ["/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS", "/COMPONENTS=icons,ext\\reg\\shellhere,assoc,assoc_sh"]
  },
  {
    id: "vscode",
    name: "VS Code",
    description: "Visual Studio Code 代码编辑器",
    category: "other",
    icon: "vscode",
    homepage: "https://code.visualstudio.com",
    verifyCommand: "code --version",
    versions: [
      {
        version: "1.89.0",
        filename: "VSCodeSetup-x64-1.89.0.exe",
        downloadUrls: {
          official: "https://update.code.visualstudio.com/1.89.0/win32-x64/stable",
          aliyun: "https://vscode.cdn.azure.cn/stable/b58957e67ee1e712cebf466b995adf4c5307b2bd/VSCodeSetup-x64-1.89.0.exe",
          huawei: "https://repo.huaweicloud.com/VSCode/1.89.0/VSCodeSetup-x64-1.89.0.exe",
          tencent: "https://mirrors.cloud.tencent.com/vscode/1.89.0/VSCodeSetup-x64-1.89.0.exe"
        }
      }
    ],
    installArgs: ["/VERYSILENT", "/MERGETASKS=!runcode,addcontextmenufiles,addcontextmenufolders,addtopath"]
  }
];
const DEFAULT_SETTINGS = {
  installBaseDir: "C:\\DevTools",
  downloadDir: "C:\\DevTools\\_downloads",
  preferredMirror: "auto",
  probeTimeoutMs: 3e3,
  concurrentDownloads: 2,
  autoDetectInstalled: true
};
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatSpeed(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}
class Downloader extends events.EventEmitter {
  controllers = /* @__PURE__ */ new Map();
  async download(taskId, url, destDir, filename, onProgress) {
    await fsExtra.ensureDir(destDir);
    const filePath = path.join(destDir, filename);
    const controller = new AbortController();
    this.controllers.set(taskId, controller);
    let lastTime = Date.now();
    let lastBytes = 0;
    let response;
    try {
      response = await axios.get(url, {
        responseType: "stream",
        signal: controller.signal,
        timeout: 0,
        headers: {
          "User-Agent": "dev-tool-manage/1.0"
        },
        validateStatus: (s) => s < 400
      });
    } catch (err) {
      this.controllers.delete(taskId);
      onProgress({ status: "error", error: err.message });
      throw err;
    }
    const total = parseInt(response.headers["content-length"] ?? "0", 10);
    let downloaded = 0;
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(filePath);
      response.data.on("data", (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1e3;
        if (elapsed >= 0.5) {
          const speed = (downloaded - lastBytes) / elapsed;
          lastTime = now;
          lastBytes = downloaded;
          onProgress({
            progress: total ? Math.floor(downloaded / total * 100) : 0,
            downloadedSize: formatBytes(downloaded),
            totalSize: total ? formatBytes(total) : "未知",
            speed: formatSpeed(speed),
            status: "downloading"
          });
        }
      });
      response.data.on("error", (err) => {
        this.controllers.delete(taskId);
        if (err.code === "ERR_CANCELED") {
          onProgress({ status: "paused" });
          reject(new Error("下载已暂停"));
        } else {
          onProgress({ status: "error", error: err.message });
          reject(err);
        }
      });
      response.data.pipe(fileStream);
      fileStream.on("finish", () => {
        this.controllers.delete(taskId);
        onProgress({ status: "completed", progress: 100, filePath });
        resolve(filePath);
      });
      fileStream.on("error", (err) => {
        this.controllers.delete(taskId);
        onProgress({ status: "error", error: err.message });
        reject(err);
      });
    });
  }
  pause(taskId) {
    this.controllers.get(taskId)?.abort();
    this.controllers.delete(taskId);
  }
}
const downloader = new Downloader();
const execAsync$1 = util.promisify(child_process.exec);
function runProcess(bin, args) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(bin, args, { stdio: "pipe", windowsHide: true });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`进程退出码: ${code}`));
    });
    child.on("error", reject);
  });
}
async function extractZip(zipPath, destDir) {
  await fsExtra.ensureDir(destDir);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}
async function installTool(toolId, filePath, installBaseDir, onStatus, toolConfig) {
  const config = toolConfig ?? TOOLS_CONFIG.find((t) => t.id === toolId);
  if (!config) {
    return { success: false, installPath: "", error: `找不到工具配置: ${toolId}` };
  }
  const installPath = path.join(installBaseDir, toolId);
  await fsExtra.ensureDir(installPath);
  try {
    if (filePath.startsWith("npm:")) {
      const pkg = filePath.replace("npm:", "");
      onStatus(`正在通过 npm 全局安装 ${pkg}...`);
      await execAsync$1(`npm install -g ${pkg}`);
      onStatus("npm 安装完成");
      return { success: true, installPath: "global" };
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".zip") {
      onStatus(`正在解压到 ${installPath}...`);
      await extractZip(filePath, installPath);
      const { readdirSync, statSync } = await import("fs");
      const entries = readdirSync(installPath);
      if (entries.length === 1) {
        const subDir = path.join(installPath, entries[0]);
        if (statSync(subDir).isDirectory()) {
          const tmpDir = installPath + "_tmp";
          await fsExtra.move(subDir, tmpDir);
          await fsExtra.remove(installPath);
          await fsExtra.move(tmpDir, installPath);
        }
      }
      onStatus("解压完成，正在配置环境变量...");
      await configureEnvVar(toolId, installPath, config.pathAppend);
      return { success: true, installPath };
    }
    if (ext === ".exe") {
      onStatus(`正在执行安装程序...`);
      const args = [...config.installArgs ?? [], `/DIR=${installPath}`];
      await runProcess(filePath, args);
      onStatus("安装完成");
      return { success: true, installPath };
    }
    if (ext === ".msi") {
      onStatus(`正在执行 MSI 安装...`);
      await runProcess("msiexec", ["/i", filePath, "/qn", `/INSTALLDIR=${installPath}`]);
      onStatus("安装完成");
      return { success: true, installPath };
    }
    return { success: false, installPath: "", error: `不支持的安装包格式: ${ext}` };
  } catch (err) {
    log.error(`安装 ${toolId} 失败:`, err);
    return { success: false, installPath: "", error: err.message };
  }
}
async function configureEnvVar(toolId, installPath, pathAppend) {
  const binPath = pathAppend ? path.join(installPath, pathAppend) : installPath;
  const exists = await fsExtra.pathExists(binPath);
  if (!exists) return;
  try {
    const { stdout: currentPath } = await execAsync$1(
      `powershell -Command "[Environment]::GetEnvironmentVariable('PATH', 'Machine')"`
    );
    const cleanPath = currentPath.trim();
    if (!cleanPath.includes(binPath)) {
      await execAsync$1(
        `powershell -Command "[Environment]::SetEnvironmentVariable('PATH', '${cleanPath};${binPath}', 'Machine')"`
      );
    }
    if (toolId.startsWith("jdk")) {
      await execAsync$1(
        `powershell -Command "[Environment]::SetEnvironmentVariable('JAVA_HOME', '${installPath}', 'Machine')"`
      );
    } else if (toolId === "maven") {
      await execAsync$1(
        `powershell -Command "[Environment]::SetEnvironmentVariable('MAVEN_HOME', '${installPath}', 'Machine')"`
      );
    } else if (toolId === "python") {
      await execAsync$1(
        `powershell -Command "[Environment]::SetEnvironmentVariable('PYTHON_HOME', '${installPath}', 'Machine')"`
      );
    }
  } catch (err) {
    log.warn("配置环境变量失败（可能需要管理员权限）:", err);
  }
}
function extractVersion(raw) {
  const line = raw.split("\n")[0].trim();
  const match = line.match(/\d+\.\d+[\d.]*/);
  return match ? match[0] : line.slice(0, 40);
}
async function verifyInstall(verifyCommand) {
  if (!verifyCommand) return null;
  try {
    const { stdout, stderr } = await execAsync$1(verifyCommand, { timeout: 5e3 });
    const raw = (stdout || stderr).trim();
    return raw || null;
  } catch {
    return null;
  }
}
async function findCommandPath(verifyCommand) {
  if (!verifyCommand) return { exePath: null, allPaths: [] };
  const bin = verifyCommand.split(" ")[0];
  try {
    const { stdout } = await execAsync$1(`where ${bin}`, { timeout: 3e3 });
    const allPaths = stdout.trim().replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (allPaths.length) return { exePath: allPaths[0], allPaths };
  } catch {
  }
  try {
    const { stdout } = await execAsync$1(
      `powershell -NoProfile -Command "(Get-Command ${bin} -ErrorAction SilentlyContinue).Source"`,
      { timeout: 5e3 }
    );
    const exePath = stdout.trim().replace(/\r/g, "");
    if (exePath) return { exePath, allPaths: [exePath] };
  } catch {
  }
  try {
    const { stdout } = await execAsync$1(
      `cmd /c for %i in (${bin}.exe ${bin}.cmd ${bin}) do @if exist "%~$PATH:i" echo %~$PATH:i`,
      { timeout: 4e3 }
    );
    const exePath = stdout.trim().replace(/\r/g, "").split("\n")[0].trim();
    if (exePath) return { exePath, allPaths: [exePath] };
  } catch {
  }
  return { exePath: null, allPaths: [] };
}
const PROBE_URLS = {
  official: "https://nodejs.org/dist/",
  aliyun: "https://mirrors.tuna.tsinghua.edu.cn",
  huawei: "https://repo.huaweicloud.com",
  tencent: "https://mirrors.tuna.tsinghua.edu.cn"
};
async function probeUrl(url, timeoutMs = 3e3) {
  try {
    await axios.head(url, { timeout: timeoutMs, validateStatus: (s) => s < 400 });
    return true;
  } catch {
    return false;
  }
}
async function probeAll(timeoutMs = 3e3) {
  const probes = Object.entries(PROBE_URLS).map(async ([region, url]) => {
    const start = Date.now();
    const ok = await probeUrl(url, timeoutMs);
    const latency = Date.now() - start;
    return { region, url, ok, latency };
  });
  return Promise.all(probes);
}
async function detectBestMirror(timeoutMs = 3e3) {
  const results = await probeAll(timeoutMs);
  const available = results.filter((r) => r.ok).sort((a, b) => (a.latency ?? 9999) - (b.latency ?? 9999));
  return available.length === 0 ? "aliyun" : available[0].region;
}
async function resolveBestDownloadUrl(version, preferred, timeoutMs = 3e3) {
  const order = preferred === "auto" ? ["aliyun", "huawei", "tencent", "official"] : [preferred, "aliyun", "huawei", "tencent", "official"];
  for (const mirror of order) {
    const url = version.downloadUrls[mirror];
    if (!url || url.startsWith("npm:")) {
      return { url, mirror };
    }
    const reachable = await probeUrl(url, timeoutMs);
    if (reachable) {
      return { url, mirror };
    }
  }
  const fallback = order[0];
  return { url: version.downloadUrls[fallback], mirror: fallback };
}
let db = null;
function resolveDbPath() {
  const baseDir = electron.app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  return path.join(baseDir, "db", "task-cache.db");
}
function openDb() {
  if (db) return db;
  const preferredPath = resolveDbPath();
  try {
    fs.mkdirSync(path.dirname(preferredPath), { recursive: true });
    db = new sqlite3.Database(preferredPath);
    return db;
  } catch {
    const fallbackPath = path.join(electron.app.getPath("userData"), "db", "task-cache.db");
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    db = new sqlite3.Database(fallbackPath);
    return db;
  }
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    openDb().run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    openDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    openDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}
async function transaction(fn) {
  await run("BEGIN TRANSACTION");
  try {
    await fn();
    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }
}
async function initTaskDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS category (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
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
  `);
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
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS software_version_url (
      version_id INTEGER NOT NULL,
      mirror TEXT NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (version_id, mirror),
      FOREIGN KEY (version_id) REFERENCES software_version(id)
    )
  `);
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
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS task_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      line TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task(id)
    )
  `);
}
async function loadTaskCache() {
  await initTaskDb();
  const taskRows = await all("SELECT * FROM task ORDER BY started_at DESC");
  const logRows = await all(
    "SELECT task_id, line, line_no FROM task_log ORDER BY task_id, line_no"
  );
  const downloadTasks = taskRows.map((r) => [
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
      error: r.error ?? void 0,
      filePath: r.file_path ?? void 0,
      downloadUrl: r.download_url ?? void 0,
      startedAt: r.started_at ?? void 0,
      completedAt: r.completed_at ?? void 0
    }
  ]);
  const logsMap = /* @__PURE__ */ new Map();
  for (const row of logRows) {
    const lines = logsMap.get(row.task_id) ?? [];
    lines.push(row.line);
    logsMap.set(row.task_id, lines);
  }
  return { downloadTasks, installLogs: [...logsMap.entries()] };
}
async function saveTaskCache(payload) {
  await initTaskDb();
  await transaction(async () => {
    await run("DELETE FROM task_log");
    await run("DELETE FROM task");
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
      );
    }
    for (const [taskId, lines] of payload.installLogs) {
      for (let i = 0; i < lines.length; i++) {
        await run("INSERT INTO task_log (task_id, line_no, line) VALUES (?, ?, ?)", [taskId, i, lines[i]]);
      }
    }
  });
}
async function upsertTask(task) {
  await initTaskDb();
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
  );
}
const CATEGORY_NAME_MAP = {
  backend: "后端",
  frontend: "前端",
  ai: "AI 工具",
  other: "其他"
};
async function loadToolsCatalog() {
  await initTaskDb();
  const categories = await all("SELECT id FROM category ORDER BY sort_order, id");
  if (!categories.length) return [];
  const softwareRows = await all("SELECT * FROM software ORDER BY sort_order, id");
  const versionRows = await all("SELECT * FROM software_version ORDER BY sort_order, id");
  const urlRows = await all(
    "SELECT version_id, mirror, url FROM software_version_url"
  );
  const urlsByVersionId = /* @__PURE__ */ new Map();
  for (const row of urlRows) {
    const urls = urlsByVersionId.get(row.version_id) ?? {};
    urls[row.mirror] = row.url;
    urlsByVersionId.set(row.version_id, urls);
  }
  const versionsBySoftware = /* @__PURE__ */ new Map();
  for (const row of versionRows) {
    const list = versionsBySoftware.get(row.software_id) ?? [];
    list.push({
      version: row.version,
      filename: row.filename,
      size: row.size ?? void 0,
      sha256: row.sha256 ?? void 0,
      downloadUrls: urlsByVersionId.get(row.id) ?? {}
    });
    versionsBySoftware.set(row.software_id, list);
  }
  return softwareRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category_id,
    icon: row.icon,
    homepage: row.homepage,
    verifyCommand: row.verify_command ?? void 0,
    pathAppend: row.path_append ?? void 0,
    installArgs: row.install_args_json ? JSON.parse(row.install_args_json) : void 0,
    versions: versionsBySoftware.get(row.id) ?? []
  }));
}
async function saveToolsCatalog(catalog) {
  await initTaskDb();
  await transaction(async () => {
    await run("DELETE FROM software_version_url");
    await run("DELETE FROM software_version");
    await run("DELETE FROM software");
    await run("DELETE FROM category");
    const categories = [...new Set(catalog.map((t) => t.category))];
    for (let i = 0; i < categories.length; i++) {
      const id = categories[i];
      await run("INSERT INTO category (id, name, sort_order) VALUES (?, ?, ?)", [id, CATEGORY_NAME_MAP[id] ?? id, i]);
    }
    for (let i = 0; i < catalog.length; i++) {
      const tool = catalog[i];
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
      );
      for (let j = 0; j < tool.versions.length; j++) {
        const v = tool.versions[j];
        await run(
          `
          INSERT INTO software_version (software_id, version, filename, size, sha256, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          [tool.id, v.version, v.filename, v.size ?? null, v.sha256 ?? null, j]
        );
        const versionRow = await get(
          "SELECT id FROM software_version WHERE software_id = ? AND version = ?",
          [tool.id, v.version]
        );
        if (!versionRow?.id) continue;
        for (const [mirror, url] of Object.entries(v.downloadUrls ?? {})) {
          await run("INSERT INTO software_version_url (version_id, mirror, url) VALUES (?, ?, ?)", [
            versionRow.id,
            mirror,
            url
          ]);
        }
      }
    }
  });
}
const execAsync = util.promisify(child_process.exec);
function generateId() {
  return crypto.randomBytes(4).toString("hex");
}
const store = new Store({
  defaults: {
    settings: DEFAULT_SETTINGS,
    installed: {}
  }
});
function registerIpcHandlers(mainWindow2) {
  async function resolveDownloadUrl(url) {
    if (!url.includes("api.foojay.io") || !url.includes("/redirect")) return url;
    try {
      const res = await axios.get(url, {
        timeout: 8e3,
        maxRedirects: 0,
        validateStatus: (s) => s >= 300 && s < 400
      });
      const location = String(res.headers?.location ?? "").trim();
      if (location) {
        log.info(`[download] foojay redirect resolved: ${location}`);
        return location;
      }
      return url;
    } catch (e) {
      const location = String(e?.response?.headers?.location ?? "").trim();
      if (location) {
        log.info(`[download] foojay redirect resolved(from error): ${location}`);
        return location;
      }
      log.warn(`[download] resolve redirect failed, fallback original: ${e?.message ?? e}`);
      return url;
    }
  }
  async function getToolsCatalog() {
    const fromDb = await loadToolsCatalog();
    if (fromDb.length > 0) return fromDb;
    await saveToolsCatalog(TOOLS_CONFIG);
    return TOOLS_CONFIG;
  }
  electron.ipcMain.handle("tools:list", async () => {
    const toolsCatalog = await getToolsCatalog();
    const installed = store.get("installed");
    return toolsCatalog.map((tool) => ({
      ...tool,
      installed: installed[tool.id] ?? null
    }));
  });
  electron.ipcMain.handle("tools:clearCache", () => {
    store.set("installed", {});
    return true;
  });
  electron.ipcMain.handle("tools:autoDetect", async () => {
    const toolsCatalog = await getToolsCatalog();
    const installed = store.get("installed");
    let changed = false;
    for (const tool of toolsCatalog) {
      mainWindow2.webContents.send("tools:detectProgress", {
        toolId: tool.id,
        toolName: tool.name,
        status: "checking"
      });
      const [version, { exePath, allPaths }] = await Promise.all([
        verifyInstall(tool.verifyCommand),
        findCommandPath(tool.verifyCommand)
      ]);
      if (version) {
        const cleanVersion = extractVersion(version);
        const installPath = exePath ?? "system";
        installed[tool.id] = {
          id: tool.id,
          version: cleanVersion,
          installPath,
          exePath: exePath ?? void 0,
          installedAt: installed[tool.id]?.installedAt ?? (/* @__PURE__ */ new Date()).toISOString()
        };
        changed = true;
        mainWindow2.webContents.send("tools:detectProgress", {
          toolId: tool.id,
          toolName: tool.name,
          status: "found",
          version: cleanVersion,
          installPath,
          allPaths
        });
      } else {
        if (installed[tool.id]?.installPath === "system") {
          delete installed[tool.id];
          changed = true;
        }
        mainWindow2.webContents.send("tools:detectProgress", {
          toolId: tool.id,
          toolName: tool.name,
          status: "not_found"
        });
      }
    }
    if (changed) store.set("installed", installed);
    mainWindow2.webContents.send("tools:detectProgress", { status: "done" });
    return toolsCatalog.map((tool) => ({
      ...tool,
      installed: installed[tool.id] ?? null
    }));
  });
  electron.ipcMain.handle("settings:get", () => store.get("settings"));
  electron.ipcMain.handle("settings:save", (_event, settings) => {
    store.set("settings", settings);
    return true;
  });
  electron.ipcMain.handle("taskCache:get", async () => {
    return loadTaskCache();
  });
  electron.ipcMain.handle(
    "taskCache:save",
    async (_event, payload) => {
      await saveTaskCache(payload);
      return true;
    }
  );
  electron.ipcMain.handle("network:detect", async () => {
    const settings = store.get("settings");
    return detectBestMirror(settings.probeTimeoutMs);
  });
  electron.ipcMain.handle("network:probeAll", async () => {
    const settings = store.get("settings");
    return probeAll(settings.probeTimeoutMs);
  });
  electron.ipcMain.on("renderer:log", (_event, level, ...args) => {
    const msg = args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
    if (level === "error") log.error(`[renderer] ${msg}`);
    else if (level === "warn") log.warn(`[renderer] ${msg}`);
    else log.info(`[renderer] ${msg}`);
  });
  electron.ipcMain.handle("download:start", async (_event, payload) => {
    log.info(`[download:start] payload=`, JSON.stringify(payload));
    const settings = store.get("settings");
    log.info(`[download:start] settings=`, JSON.stringify({ installBaseDir: settings?.installBaseDir, downloadDir: settings?.downloadDir, preferredMirror: settings?.preferredMirror }));
    const toolsCatalog = await getToolsCatalog();
    const toolConfig = toolsCatalog.find((t) => t.id === payload.toolId);
    if (!toolConfig) throw new Error(`工具不存在: ${payload.toolId}`);
    let versionConfig = toolConfig.versions.find((v) => v.version === payload.version);
    log.info(`[download:start] staticVersionConfig found=`, !!versionConfig);
    if (!versionConfig && payload.dynamicUrls) {
      const v = payload.version;
      let filename;
      if (payload.dynamicFilename) {
        filename = payload.dynamicFilename;
      } else if (payload.toolId === "maven") {
        filename = `apache-maven-${v}-bin.zip`;
      } else if (payload.toolId === "python") {
        filename = `python-${v}-amd64.exe`;
      } else {
        filename = `node-v${v}-win-x64.zip`;
      }
      versionConfig = { version: v, filename, downloadUrls: payload.dynamicUrls };
      log.info(`[download:start] built dynamic versionConfig: filename=${filename} urls=`, JSON.stringify(payload.dynamicUrls));
    }
    versionConfig ??= toolConfig.versions[0];
    log.info(`[download:start] final versionConfig: version=${versionConfig.version} filename=${versionConfig.filename}`);
    log.info(`[download:start] probing mirrors...`);
    const { url, mirror } = await resolveBestDownloadUrl(
      versionConfig,
      payload.mirror ?? settings.preferredMirror,
      settings.probeTimeoutMs
    );
    const finalUrl = await resolveDownloadUrl(url);
    log.info(`[download:start] resolved: mirror=${mirror} url=${url} finalUrl=${finalUrl}`);
    const taskId = generateId();
    const downloadDir = settings.downloadDir || path.join(settings.installBaseDir, "_downloads");
    log.info(`[download:start] taskId=${taskId} downloadDir=${downloadDir}`);
    const task = {
      id: taskId,
      toolId: payload.toolId,
      toolName: toolConfig.name,
      version: versionConfig.version,
      status: "pending",
      progress: 0,
      speed: "0 B/s",
      totalSize: "未知",
      downloadedSize: "0 B",
      mirrorUsed: mirror,
      downloadUrl: finalUrl,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    mainWindow2.webContents.send("download:progress", task);
    await upsertTask(task);
    if (finalUrl.startsWith("npm:")) {
      const result = await installTool(
        payload.toolId,
        finalUrl,
        settings.installBaseDir,
        (msg) => mainWindow2.webContents.send("install:status", { taskId, msg }),
        toolConfig
      );
      if (result.success) {
        const installed = store.get("installed");
        installed[payload.toolId] = {
          id: payload.toolId,
          version: versionConfig.version,
          installPath: result.installPath,
          installedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        store.set("installed", installed);
        const doneTask = { ...task, status: "completed", progress: 100 };
        mainWindow2.webContents.send("download:progress", doneTask);
        await upsertTask(doneTask);
      }
      return taskId;
    }
    downloader.download(taskId, finalUrl, downloadDir, versionConfig.filename, (patch) => {
      if (patch.status === "completed") patch.completedAt = (/* @__PURE__ */ new Date()).toISOString();
      const updatedTask = { ...task, ...patch };
      mainWindow2.webContents.send("download:progress", updatedTask);
      void upsertTask(updatedTask);
      if (patch.filePath) task.filePath = patch.filePath;
    }).then(async (filePath) => {
      if (payload.downloadOnly) {
        mainWindow2.webContents.send("install:complete", {
          taskId,
          toolId: payload.toolId,
          success: true,
          downloadOnly: true,
          filePath
        });
        return;
      }
      mainWindow2.webContents.send("install:status", { taskId, msg: "下载完成，准备安装..." });
      const result = await installTool(
        payload.toolId,
        filePath,
        settings.installBaseDir,
        (msg) => mainWindow2.webContents.send("install:status", { taskId, msg }),
        toolConfig
      );
      if (result.success) {
        const installed = store.get("installed");
        installed[payload.toolId] = {
          id: payload.toolId,
          version: versionConfig.version,
          installPath: result.installPath,
          installedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        store.set("installed", installed);
        mainWindow2.webContents.send("install:complete", {
          taskId,
          toolId: payload.toolId,
          success: true,
          installPath: result.installPath
        });
      } else {
        mainWindow2.webContents.send("install:complete", {
          taskId,
          toolId: payload.toolId,
          success: false,
          error: result.error
        });
      }
    }).catch((err) => {
      log.error("下载失败:", err);
    });
    return taskId;
  });
  electron.ipcMain.handle("download:pause", (_event, taskId) => {
    downloader.pause(taskId);
  });
  electron.ipcMain.handle("download:openFile", (_event, filePath) => {
    electron.shell.showItemInFolder(filePath);
  });
  electron.ipcMain.handle("tool:verify", async (_event, toolId) => {
    const toolsCatalog = await getToolsCatalog();
    const config = toolsCatalog.find((t) => t.id === toolId);
    return verifyInstall(config?.verifyCommand);
  });
  electron.ipcMain.handle("tool:openDir", (_event, dirPath) => {
    electron.shell.openPath(dirPath);
  });
  electron.ipcMain.handle("tool:unmark", (_event, toolId) => {
    const installed = store.get("installed");
    delete installed[toolId];
    store.set("installed", installed);
    return true;
  });
  electron.ipcMain.handle("python:fetchVersions", async () => {
    const mirrorUrls = [
      "https://mirrors.tuna.tsinghua.edu.cn/python/",
      "https://repo.huaweicloud.com/python/",
      "https://www.python.org/ftp/python/"
    ];
    const MONTH = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };
    function normalizeDate(raw) {
      const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      if (m) return `${m[3]}-${MONTH[m[2]] ?? "01"}-${m[1]}`;
      return raw;
    }
    const mirrors = {
      official: "https://www.python.org/ftp/python",
      aliyun: "https://mirrors.tuna.tsinghua.edu.cn/python",
      huawei: "https://repo.huaweicloud.com/python",
      tencent: "https://mirrors.tuna.tsinghua.edu.cn/python"
    };
    for (const url of mirrorUrls) {
      try {
        log.info(`[python versions] 尝试: ${url}`);
        const res = await axios.get(url, { timeout: 6e3 });
        const html = res.data;
        const lineRe = /href="(3\.\d+\.\d+)\/[^"]*"[^\n]*?(\d{2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/g;
        const versionDateMap = {};
        let lm;
        while ((lm = lineRe.exec(html)) !== null) {
          const ver = lm[1].replace(/\s/g, "");
          if (!versionDateMap[ver]) versionDateMap[ver] = normalizeDate(lm[2]);
        }
        if (Object.keys(versionDateMap).length === 0) {
          const simpleRe = /href="(3\.\d+\.\d+)\//g;
          while ((lm = simpleRe.exec(html)) !== null) {
            const ver = lm[1].replace(/\s/g, "");
            if (!versionDateMap[ver]) versionDateMap[ver] = "";
          }
        }
        const sorted = Object.keys(versionDateMap).sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
          }
          return 0;
        }).slice(0, 20);
        const verified = [];
        for (const v of sorted) {
          const filename = `python-${v}-amd64.exe`;
          const officialUrl = `${mirrors.official}/${v}/${filename}`;
          try {
            await axios.head(officialUrl, { timeout: 4e3, validateStatus: (s) => s < 400 });
            verified.push({
              version: v,
              date: versionDateMap[v] ?? "",
              lts: false,
              filename,
              downloadUrls: {
                official: officialUrl,
                aliyun: `${mirrors.aliyun}/${v}/${filename}`,
                huawei: `${mirrors.huawei}/${v}/${filename}`,
                tencent: `${mirrors.tencent}/${v}/${filename}`
              }
            });
          } catch {
          }
          if (verified.length >= 15) break;
        }
        log.info(`[python versions] 成功，目录 ${sorted.length} 个，已校验可下载 ${verified.length} 个，来源: ${url}`);
        return verified;
      } catch (e) {
        log.warn(`[python versions] 失败: ${url} — ${e.message}`);
      }
    }
    return [];
  });
  const jdkVendors = [
    { id: "openjdk", name: "OpenJDK", distribution: "openjdk" },
    { id: "eclipse", name: "Eclipse Temurin", distribution: "temurin" },
    { id: "bellsoft", name: "BellSoft Liberica", distribution: "liberica" },
    { id: "jetbrains", name: "JetBrains Runtime", distribution: "jetbrains" }
  ];
  async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
  }
  async function fetchFoojayPackages(params, retries = 3) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get("https://api.foojay.io/disco/v3.0/packages", {
          timeout: 12e3,
          params
        });
        return res.data?.result ?? [];
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        const retryable = e?.code === "ECONNABORTED" || status === 429 || status === 502 || status === 503 || status === 504;
        if (!retryable || i === retries - 1) break;
        await sleep(600 * (i + 1));
      }
    }
    throw lastErr;
  }
  electron.ipcMain.handle("jdk:fetchVendors", async () => jdkVendors.map((v) => ({ id: v.id, name: v.name })));
  electron.ipcMain.handle("jdk:fetchVersions", async (_event, vendorId) => {
    const vendor = jdkVendors.find((v) => v.id === (vendorId || "eclipse")) ?? jdkVendors[1];
    try {
      let items = [];
      const baseParams = {
        distribution: vendor.distribution,
        operating_system: "windows",
        archive_type: "zip",
        package_type: "jdk",
        latest: "available",
        release_status: "ga"
      };
      const archCandidates = vendor.id === "bellsoft" ? ["amd64", "x64"] : ["x64", "amd64"];
      let lastErr;
      for (const arch of archCandidates) {
        try {
          items = await fetchFoojayPackages({ ...baseParams, architecture: arch }, 3);
          if (items.length) break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!items.length && vendor.id === "eclipse") {
        try {
          const releasesRes = await axios.get("https://api.adoptium.net/v3/info/available_releases", { timeout: 1e4 });
          const ltsVersions = [...releasesRes.data.available_lts_releases].reverse();
          const fallbackResults = [];
          for (const major of ltsVersions) {
            try {
              const r = await axios.get(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot`, {
                params: { architecture: "x64", image_type: "jdk", os: "windows", vendor: "eclipse" },
                timeout: 1e4
              });
              const first = r.data?.[0];
              if (!first) continue;
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
              });
            } catch {
            }
          }
          if (fallbackResults.length) {
            log.info(`[jdk versions] vendor=${vendor.id} foojay失败，adoptium回退成功 ${fallbackResults.length} 个版本`);
            return fallbackResults;
          }
        } catch {
        }
      }
      if (!items.length && lastErr) throw lastErr;
      const list = items.filter((i) => i?.links?.pkg_download_redirect && i?.filename).sort((a, b) => Number(b.major_version || 0) - Number(a.major_version || 0)).slice(0, 20).map((i) => {
        const version = String(i.distribution_version || i.java_version || i.major_version);
        const filename = String(i.filename);
        const officialUrl = String(i.links.pkg_download_redirect);
        const major = Number(i.major_version || 0);
        const tsinghuaAdoptium = `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jdk/x64/windows/${filename}`;
        const ustcAdoptium = `https://mirrors.ustc.edu.cn/adoptium/${major}/jdk/x64/windows/${filename}`;
        const isEclipseTemurin = vendor.id === "eclipse";
        return {
          version,
          lts: i.term_of_support === "lts",
          major,
          filename,
          downloadUrls: {
            official: officialUrl,
            // For Temurin, provide domestic mirrors first; final selection still goes through reachability probe.
            aliyun: isEclipseTemurin ? tsinghuaAdoptium : officialUrl,
            huawei: isEclipseTemurin ? ustcAdoptium : officialUrl,
            tencent: isEclipseTemurin ? tsinghuaAdoptium : officialUrl
          }
        };
      });
      log.info(`[jdk versions] vendor=${vendor.id} 成功，共 ${list.length} 个版本`);
      return list;
    } catch (e) {
      log.warn(`[jdk versions] vendor=${vendor.id} 获取失败: ${e.message}`);
      return [];
    }
  });
  electron.ipcMain.handle("maven:fetchVersions", async () => {
    const metadataUrls = [
      "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml",
      "https://maven.aliyun.com/repository/public/org/apache/maven/apache-maven/maven-metadata.xml",
      "https://repo.huaweicloud.com/repository/maven/org/apache/maven/apache-maven/maven-metadata.xml"
    ];
    for (const url of metadataUrls) {
      try {
        log.info(`[maven versions] 尝试: ${url}`);
        const res = await axios.get(url, { timeout: 6e3 });
        const xml = res.data;
        const versions = [];
        const regex = /<version>(3\.\d+\.\d+)<\/version>/g;
        let m;
        while ((m = regex.exec(xml)) !== null) {
          versions.push(m[1]);
        }
        const unique = [...new Set(versions)].sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
          }
          return 0;
        }).slice(0, 20);
        log.info(`[maven versions] 成功，${unique.length} 个版本，来源: ${url}`);
        return unique.map((v) => ({ version: v }));
      } catch (e) {
        log.warn(`[maven versions] 失败: ${url} — ${e.message}`);
      }
    }
    return [];
  });
  electron.ipcMain.handle("nodejs:fetchVersions", async () => {
    const urls = [
      "https://nodejs.org/dist/index.json",
      "https://mirrors.aliyun.com/nodejs-release/index.json",
      "https://repo.huaweicloud.com/nodejs/index.json",
      "https://mirrors.cloud.tencent.com/nodejs-release/index.json"
    ];
    for (const url of urls) {
      try {
        log.info(`[nodejs versions] 尝试: ${url}`);
        const res = await axios.get(url, { timeout: 6e3 });
        const list = res.data.filter((v) => Array.isArray(v.files) && v.files.includes("win-x64-zip")).slice(0, 30).map((v) => ({
          version: v.version.replace(/^v/, ""),
          date: v.date,
          lts: v.lts,
          npm: v.npm
        }));
        log.info(`[nodejs versions] 成功，共 ${list.length} 个版本，来源: ${url}`);
        return list;
      } catch (e) {
        log.warn(`[nodejs versions] 失败: ${url} — ${e.message}`);
      }
    }
    return [];
  });
  electron.ipcMain.handle("git:fetchVersions", async () => {
    const MONTH = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };
    function normalizeDate(raw) {
      const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      if (m) return `${m[3]}-${MONTH[m[2]] ?? "01"}-${m[1]}`;
      return raw;
    }
    function buildUrls(tag, version) {
      const file = `Git-${version}-64-bit.exe`;
      return {
        filename: file,
        downloadUrls: {
          official: `https://github.com/git-for-windows/git/releases/download/${tag}/${file}`,
          aliyun: `https://mirrors.aliyun.com/git-for-windows/${tag}/${file}`,
          huawei: `https://repo.huaweicloud.com/git-for-windows/${tag}/${file}`,
          tencent: `https://mirrors.cloud.tencent.com/git-for-windows/${tag}/${file}`
        }
      };
    }
    try {
      const res = await axios.get("https://repo.huaweicloud.com/git-for-windows/", { timeout: 6e3 });
      const html = res.data;
      const lineRe = /href="(v(\d+\.\d+\.\d+)\.windows\.(\d+))\/[^"]*"[^\n]*?(\d{2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/g;
      const versionMap = {};
      let m;
      while ((m = lineRe.exec(html)) !== null) {
        const [, tag, ver, winStr, rawDate] = m;
        const winNum = parseInt(winStr);
        if (!versionMap[ver] || winNum > versionMap[ver].winNum)
          versionMap[ver] = { tag, date: normalizeDate(rawDate), winNum };
      }
      const sorted = Object.keys(versionMap).sort((a, b) => {
        const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
        return 0;
      }).slice(0, 15);
      if (sorted.length) {
        log.info(`[git versions] Huawei mirror 成功，${sorted.length} 个版本`);
        return sorted.map((ver) => {
          const { tag, date } = versionMap[ver];
          return { version: ver, date, lts: false, ...buildUrls(tag, ver) };
        });
      }
    } catch (e) {
      log.warn(`[git versions] Huawei mirror 失败: ${e.message}`);
    }
    try {
      const res = await axios.get(
        "https://api.github.com/repos/git-for-windows/git/releases?per_page=20",
        { timeout: 8e3, headers: { "User-Agent": "dev-tool-manage" } }
      );
      const list = res.data.filter((r) => !r.prerelease && /^v\d+\.\d+\.\d+\.windows\.\d+$/.test(r.tag_name)).slice(0, 15).map((r) => {
        const tag = r.tag_name;
        const ver = tag.replace(/^v/, "").replace(/\.windows\.\d+$/, "");
        return { version: ver, date: r.published_at?.slice(0, 10) ?? "", lts: false, ...buildUrls(tag, ver) };
      });
      log.info(`[git versions] GitHub API 成功，${list.length} 个版本`);
      return list;
    } catch (e) {
      log.warn(`[git versions] GitHub API 失败: ${e.message}`);
    }
    return [];
  });
  async function fetchNpmPackageVersions(pkgName) {
    try {
      const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`;
      log.info(`[npm versions] 尝试: ${url}`);
      const res = await axios.get(url, { timeout: 8e3 });
      const data = res.data ?? {};
      const timeMap = data.time ?? {};
      const versions = Object.keys(data.versions ?? {}).filter((v) => /^\d+\.\d+\.\d+([-.].+)?$/.test(v)).sort((a, b) => {
        const pa = a.split(/[.-]/).map((x) => Number.isNaN(Number(x)) ? -1 : Number(x));
        const pb = b.split(/[.-]/).map((x) => Number.isNaN(Number(x)) ? -1 : Number(x));
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const da = pa[i] ?? 0;
          const db2 = pb[i] ?? 0;
          if (db2 !== da) return db2 - da;
        }
        return 0;
      }).slice(0, 30);
      const list = versions.slice(0, 15).map((v) => ({
        version: v,
        date: (timeMap[v] ?? "").slice(0, 10),
        lts: false,
        filename: `install-${pkgName.replace("/", "-")}-${v}`,
        downloadUrls: {
          official: `npm:${pkgName}@${v}`,
          aliyun: `npm:${pkgName}@${v}`,
          huawei: `npm:${pkgName}@${v}`,
          tencent: `npm:${pkgName}@${v}`
        }
      }));
      log.info(`[npm versions] 成功，${pkgName} 共 ${list.length} 个版本`);
      return list;
    } catch (e) {
      log.warn(`[npm versions] 失败，${pkgName}: ${e.message}`);
      return [];
    }
  }
  electron.ipcMain.handle("codex:fetchVersions", async () => fetchNpmPackageVersions("@openai/codex"));
  electron.ipcMain.handle("claudeCode:fetchVersions", async () => fetchNpmPackageVersions("@anthropic-ai/claude-code"));
  const npmRegistries = [
    { name: "npm 官方源", url: "https://registry.npmjs.org/" },
    { name: "淘宝 npmmirror", url: "https://registry.npmmirror.com/" },
    { name: "腾讯云镜像", url: "https://mirrors.cloud.tencent.com/npm/" },
    { name: "华为云镜像", url: "https://repo.huaweicloud.com/repository/npm/" }
  ];
  electron.ipcMain.handle("npmRegistry:get", async () => {
    try {
      const { stdout } = await execAsync("npm config get registry");
      return (stdout || "").trim();
    } catch {
      return "";
    }
  });
  electron.ipcMain.handle("npmRegistry:list", async () => {
    const current = await (async () => {
      try {
        const { stdout } = await execAsync("npm config get registry");
        return (stdout || "").trim();
      } catch {
        return "";
      }
    })();
    const results = await Promise.all(
      npmRegistries.map(async (item) => {
        const start = Date.now();
        const pingUrl = `${item.url.replace(/\/+$/, "")}/-/ping`;
        try {
          await axios.get(pingUrl, { timeout: 3e3, validateStatus: (s) => s < 400 });
          return { ...item, ok: true, latency: Date.now() - start, current: current === item.url || current === item.url.replace(/\/+$/, "") };
        } catch {
          return { ...item, ok: false, latency: null, current: current === item.url || current === item.url.replace(/\/+$/, "") };
        }
      })
    );
    return results;
  });
  electron.ipcMain.handle("npmRegistry:set", async (_event, url) => {
    const safeUrl = String(url || "").trim();
    if (!safeUrl.startsWith("http")) throw new Error("无效的 npm 源地址");
    await execAsync(`npm config set registry "${safeUrl}"`);
    return true;
  });
  electron.ipcMain.handle("dialog:selectDir", async (_event, defaultPath) => {
    const result = await electron.dialog.showOpenDialog(mainWindow2, {
      title: "选择安装目录",
      defaultPath: defaultPath ?? "C:\\",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
log.initialize();
log.transports.file.level = "info";
electron.app.disableHardwareAcceleration();
electron.app.commandLine.appendSwitch("disable-gpu");
electron.app.commandLine.appendSwitch("disable-gpu-compositing");
let mainWindow;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1a1a2e",
      symbolColor: "#ffffff",
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  registerIpcHandlers(mainWindow);
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
