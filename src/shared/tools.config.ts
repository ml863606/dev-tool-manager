import type { ToolConfig } from './types'

export const TOOLS_CONFIG: ToolConfig[] = [
  {
    id: 'jdk',
    name: 'JDK',
    description: 'Eclipse Temurin OpenJDK（支持 LTS 版本动态获取）',
    category: 'backend',
    icon: 'java',
    homepage: 'https://adoptium.net',
    verifyCommand: 'java -version',
    pathAppend: 'bin',
    versions: [
      {
        version: '21.0.3',
        filename: 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip',
        downloadUrls: {
          official: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip',
          aliyun: 'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip',
          huawei: 'https://mirrors.ustc.edu.cn/adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip',
          tencent: 'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.3_9.zip'
        }
      }
    ]
  },
  {
    id: 'maven',
    name: 'Apache Maven',
    description: 'Java 项目构建与依赖管理工具',
    category: 'backend',
    icon: 'maven',
    homepage: 'https://maven.apache.org',
    verifyCommand: 'mvn --version',
    pathAppend: 'bin',
    versions: [
      {
        version: '3.9.9',
        filename: 'apache-maven-3.9.9-bin.zip',
        downloadUrls: {
          official: 'https://downloads.apache.org/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip',
          aliyun: 'https://mirrors.aliyun.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip',
          huawei: 'https://repo.huaweicloud.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip',
          tencent: 'https://mirrors.cloud.tencent.com/apache/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip'
        }
      }
    ]
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python 编程语言运行环境',
    category: 'backend',
    icon: 'python',
    homepage: 'https://www.python.org',
    verifyCommand: 'python --version',
    versions: [
      {
        version: '3.12.3',
        filename: 'python-3.12.3-amd64.exe',
        downloadUrls: {
          official: 'https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe',
          aliyun: 'https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe',
          huawei: 'https://repo.huaweicloud.com/python/3.12.3/python-3.12.3-amd64.exe',
          tencent: 'https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe'
        }
      },
      {
        version: '3.11.9',
        filename: 'python-3.11.9-amd64.exe',
        downloadUrls: {
          official: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe',
          aliyun: 'https://mirrors.tuna.tsinghua.edu.cn/python/3.11.9/python-3.11.9-amd64.exe',
          huawei: 'https://repo.huaweicloud.com/python/3.11.9/python-3.11.9-amd64.exe',
          tencent: 'https://mirrors.tuna.tsinghua.edu.cn/python/3.11.9/python-3.11.9-amd64.exe'
        }
      }
    ],
    installArgs: ['/quiet', 'InstallAllUsers=1', 'PrependPath=1', 'Include_test=0']
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    description: 'Node.js JavaScript 运行环境',
    category: 'frontend',
    icon: 'nodejs',
    homepage: 'https://nodejs.org',
    verifyCommand: 'node --version',
    versions: [
      {
        version: '20.12.2',
        filename: 'node-v20.12.2-win-x64.zip',
        downloadUrls: {
          official: 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-win-x64.zip',
          aliyun: 'https://mirrors.aliyun.com/nodejs-release/v20.12.2/node-v20.12.2-win-x64.zip',
          huawei: 'https://repo.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-win-x64.zip',
          tencent: 'https://mirrors.cloud.tencent.com/nodejs-release/v20.12.2/node-v20.12.2-win-x64.zip'
        }
      },
      {
        version: '18.20.2',
        filename: 'node-v18.20.2-win-x64.zip',
        downloadUrls: {
          official: 'https://nodejs.org/dist/v18.20.2/node-v18.20.2-win-x64.zip',
          aliyun: 'https://mirrors.aliyun.com/nodejs-release/v18.20.2/node-v18.20.2-win-x64.zip',
          huawei: 'https://repo.huaweicloud.com/nodejs/v18.20.2/node-v18.20.2-win-x64.zip',
          tencent: 'https://mirrors.cloud.tencent.com/nodejs-release/v18.20.2/node-v18.20.2-win-x64.zip'
        }
      }
    ]
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'MySQL 数据库服务端与命令行工具',
    category: 'database',
    icon: 'mysql',
    homepage: 'https://www.mysql.com',
    verifyCommand: 'mysql --version',
    pathAppend: 'bin',
    versions: [
      {
        version: '8.0.27',
        filename: 'mysql-8.0.27-winx64.zip',
        downloadUrls: {
          official: 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.27-winx64.zip',
          aliyun: 'https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0/mysql-8.0.27-winx64.zip',
          huawei: 'https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0/mysql-8.0.27-winx64.zip',
          tencent: 'https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0/mysql-8.0.27-winx64.zip'
        }
      }
    ]
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Redis 内存数据库 Windows 版命令行工具',
    category: 'database',
    icon: 'redis',
    homepage: 'https://redis.io',
    verifyCommand: 'redis-server --version',
    pathAppend: 'bin',
    versions: [
      {
        version: '8.8.0',
        filename: 'Redis-8.8.0-Windows-x64-msys2-with-Service.zip',
        downloadUrls: {
          official: 'https://github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2-with-Service.zip',
          aliyun: 'https://github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2-with-Service.zip',
          huawei: 'https://github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2-with-Service.zip',
          tencent: 'https://github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2-with-Service.zip'
        }
      }
    ]
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic Claude Code CLI 工具',
    category: 'ai',
    icon: 'claude',
    homepage: 'https://claude.ai/code',
    verifyCommand: 'claude --version',
    versions: [
      {
        version: 'latest',
        filename: 'install-claude-code',
        downloadUrls: {
          official: 'npm:@anthropic-ai/claude-code',
          aliyun: 'npm:@anthropic-ai/claude-code',
          huawei: 'npm:@anthropic-ai/claude-code',
          tencent: 'npm:@anthropic-ai/claude-code'
        }
      }
    ]
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    description: 'OpenAI Codex 命令行工具',
    category: 'ai',
    icon: 'openai',
    homepage: 'https://github.com/openai/codex',
    verifyCommand: 'codex --version',
    versions: [
      {
        version: 'latest',
        filename: 'install-codex',
        downloadUrls: {
          official: 'npm:@openai/codex',
          aliyun: 'npm:@openai/codex',
          huawei: 'npm:@openai/codex',
          tencent: 'npm:@openai/codex'
        }
      }
    ]
  },
  {
    id: 'git',
    name: 'Git',
    description: '分布式版本控制系统',
    category: 'other',
    icon: 'git',
    homepage: 'https://git-scm.com',
    verifyCommand: 'git --version',
    versions: [
      {
        version: '2.45.0',
        filename: 'Git-2.45.0-64-bit.exe',
        downloadUrls: {
          official: 'https://github.com/git-for-windows/git/releases/download/v2.45.0.windows.1/Git-2.45.0-64-bit.exe',
          aliyun: 'https://mirrors.aliyun.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe',
          huawei: 'https://repo.huaweicloud.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe',
          tencent: 'https://mirrors.cloud.tencent.com/git-for-windows/v2.45.0.windows.1/Git-2.45.0-64-bit.exe'
        }
      }
    ],
    installArgs: ['/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', '/COMPONENTS=icons,ext\\reg\\shellhere,assoc,assoc_sh']
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Visual Studio Code 代码编辑器',
    category: 'other',
    icon: 'vscode',
    homepage: 'https://code.visualstudio.com',
    verifyCommand: 'code --version',
    versions: [
      {
        version: '1.89.0',
        filename: 'VSCodeSetup-x64-1.89.0.exe',
        downloadUrls: {
          official: 'https://update.code.visualstudio.com/1.89.0/win32-x64/stable',
          aliyun: 'https://vscode.cdn.azure.cn/stable/b58957e67ee1e712cebf466b995adf4c5307b2bd/VSCodeSetup-x64-1.89.0.exe',
          huawei: 'https://repo.huaweicloud.com/VSCode/1.89.0/VSCodeSetup-x64-1.89.0.exe',
          tencent: 'https://mirrors.cloud.tencent.com/vscode/1.89.0/VSCodeSetup-x64-1.89.0.exe'
        }
      }
    ],
    installArgs: ['/VERYSILENT', '/MERGETASKS=!runcode,addcontextmenufiles,addcontextmenufolders,addtopath']
  }
]

export const MIRROR_LABELS: Record<string, string> = {
  official: '官方源',
  aliyun: '阿里云镜像',
  huawei: '华为云镜像',
  tencent: '腾讯云镜像'
}

export const DEFAULT_SETTINGS = {
  installBaseDir: 'C:\\DevTools',
  downloadDir: 'C:\\DevTools\\_downloads',
  preferredMirror: 'huawei' as const,
  probeTimeoutMs: 3000,
  concurrentDownloads: 2,
  autoDetectInstalled: true,
  githubProxyPrefix: 'https://cdn.akaere.online'
}
