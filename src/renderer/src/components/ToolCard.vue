<template>
  <div class="tool-card" :class="{ 'tool-card--installed': isInstalled }">
    <div class="card-header">
      <div class="tool-icon" :class="`icon-${tool.icon}`">
        {{ iconText }}
      </div>
      <div class="tool-meta">
        <div class="tool-name">{{ tool.name }}</div>
        <div class="tool-category">{{ categoryLabel }}</div>
      </div>
      <div class="tool-status">
        <n-tag v-if="isInstalled" type="success" size="small">已安装</n-tag>
        <n-tag v-else type="default" size="small">未安装</n-tag>
      </div>
    </div>

    <div class="tool-desc">{{ tool.description }}</div>

    <div v-if="isInstalled" class="installed-info">
      <span class="version-badge">{{ tool.installed.version }}</span>
      <n-tooltip placement="top" :delay="300">
        <template #trigger>
          <div
            class="install-path"
            :class="{ 'install-path--clickable': canOpenPath }"
            @click="handleOpenDir"
          >
            <span class="install-path-icon">📁</span>
            <span class="install-path-text">{{ pathLabel }}</span>
          </div>
        </template>
        <template v-if="tool.installed.installPath === 'system'">
          <div class="path-tooltip-system">
            <div class="path-tooltip-title">系统 PATH 检测结果</div>
            <div v-if="systemPaths.length" class="path-tooltip-paths">
              <div v-for="p in systemPaths" :key="p" class="path-tooltip-row">{{ p }}</div>
            </div>
            <div v-else class="path-tooltip-unknown">where 命令未返回路径，可能使用了 shim 或版本管理器</div>
          </div>
        </template>
        <template v-else>
          <span v-if="canOpenPath">{{ tool.installed.installPath }}<br/><span style="color:#888;font-size:11px">点击在资源管理器中打开</span></span>
          <span v-else>{{ pathTooltip }}</span>
        </template>
      </n-tooltip>
    </div>

    <div class="card-footer">
      <n-select
        v-if="props.tool.id === 'jdk'"
        v-model:value="selectedJdkVendor"
        :options="jdkVendorOptions"
        size="small"
        class="vendor-select"
        :disabled="isDownloading || dynamicVersionsLoading || jdkVendorLoading"
        :loading="jdkVendorLoading"
        @update:value="handleJdkVendorChange"
      />
      <n-select
        v-model:value="selectedVersion"
        :options="versionOptions"
        :render-label="renderVersionLabel"
        size="small"
        class="version-select"
        :disabled="isDownloading || dynamicVersionsLoading"
        :loading="dynamicVersionsLoading"
        placeholder="加载版本中..."
      />
      <n-tooltip v-if="!showLocalInstall" placement="top" :delay="300" :disabled="!downloadUrlPreview">
        <template #trigger>
          <n-button
            size="small"
            :loading="submittingDownload"
            :disabled="submittingDownload || isDownloading || submitting"
            @click="handleDownloadOnly"
          >
            <template #icon>
              <n-icon :component="CloudDownloadOutline" />
            </template>
          </n-button>
        </template>
        <span class="url-tooltip">{{ downloadUrlPreview }}</span>
      </n-tooltip>
      <n-tooltip v-else placement="top" :delay="300">
        <template #trigger>
          <n-button size="small" type="primary" ghost :disabled="isDownloading" @click="openLocalInstallWizard">
            本地安装
          </n-button>
        </template>
        <span class="url-tooltip">{{ cachedPackage?.filePath }}</span>
      </n-tooltip>
      <n-button
        v-if="props.tool.id === 'nodejs'"
        size="small"
        :loading="npmRegistryLoading"
        :disabled="npmRegistryLoading"
        @click="openNpmRegistryModal"
      >
        设置 npm 源
      </n-button>
      <template v-if="!isInstalled">
        <n-tooltip placement="top" :delay="300" :disabled="!downloadUrlPreview">
          <template #trigger>
            <n-button type="primary" size="small" :loading="submitting || isDownloading" :disabled="submitting || isDownloading || showLocalInstall" @click="handleInstall">
              {{ submitting ? '准备中...' : isDownloading ? '处理中...' : '下载安装' }}
            </n-button>
          </template>
          <span class="url-tooltip">{{ downloadUrlPreview }}</span>
        </n-tooltip>
      </template>
      <template v-else-if="versionDiff === 'same'">
      </template>
      <template v-else>
        <n-tooltip placement="top" :delay="300" :disabled="!downloadUrlPreview">
          <template #trigger>
            <n-button
              size="small"
              :type="versionDiff === 'upgrade' ? 'primary' : 'default'"
              :loading="submitting || isDownloading"
              :disabled="submitting || isDownloading"
              @click="handleInstall"
            >
              {{ submitting ? '准备中...' : isDownloading ? '处理中...' : versionDiff === 'upgrade' ? '⬆ 升级' : '⬇ 降级' }}
            </n-button>
          </template>
          <span class="url-tooltip">{{ downloadUrlPreview }}</span>
        </n-tooltip>
      </template>
    </div>

    <n-progress
      v-if="activeTask"
      :percentage="activeTask.progress"
      :status="progressStatus"
      :show-indicator="false"
      style="margin-top: 8px"
    />
    <div v-if="activeTask" class="download-meta">
      <span>{{ activeTask.downloadedSize }} / {{ activeTask.totalSize }}</span>
      <span>{{ activeTask.speed }}</span>
      <span class="mirror-badge">{{ activeTask.mirrorUsed }}</span>
    </div>
  </div>

  <n-modal v-model:show="showNpmRegistryModal" preset="card" title="设置 npm 源" style="width: 760px" :mask-closable="true">
    <div class="npm-registry-list">
      <div class="npm-registry-head">
        <span>源名称</span>
        <span>URL</span>
        <span>可用性</span>
        <span>操作</span>
      </div>
      <div v-for="item in npmRegistries" :key="item.url" class="npm-registry-row">
        <span>{{ item.name }}<span v-if="item.current" class="current-pill">当前</span></span>
        <span class="npm-url">{{ item.url }}</span>
        <span :class="item.ok ? 'ok' : 'bad'">{{ item.ok ? `可用${item.latency ? ` (${item.latency}ms)` : ''}` : '不可用' }}</span>
        <n-button
          size="tiny"
          :type="item.current ? 'default' : 'primary'"
          :disabled="item.current || settingNpmRegistry"
          :loading="settingNpmRegistry && pendingRegistryUrl === item.url"
          @click="applyNpmRegistry(item.url)"
        >
          {{ item.current ? '已选择' : '选择' }}
        </n-button>
      </div>
    </div>
  </n-modal>

  <n-modal v-model:show="showMysqlWizard" preset="card" title="MySQL 本地安装" style="width: 820px" :mask-closable="false">
    <n-steps :current="mysqlStep" size="small" style="margin-bottom: 18px">
      <n-step title="解压位置" />
      <n-step title="服务配置" />
      <n-step title="预览配置" />
      <n-step title="开始安装" />
    </n-steps>

    <div v-if="mysqlStep === 1" class="wizard-pane">
      <div class="field-label">安装包</div>
      <div class="readonly-path">{{ cachedPackage?.filePath }}</div>
      <div class="field-label">默认解压位置</div>
      <div class="dir-row">
        <n-input v-model:value="mysqlForm.installDir" />
        <n-button @click="selectMysqlInstallDir">选择</n-button>
      </div>
    </div>

    <div v-else-if="mysqlStep === 2" class="wizard-pane form-grid">
      <div>
        <div class="field-label">服务名</div>
        <n-input v-model:value="mysqlForm.serviceName" />
      </div>
      <div>
        <div class="field-label">IP</div>
        <n-input v-model:value="mysqlForm.host" />
      </div>
      <div>
        <div class="field-label">端口</div>
        <n-input-number v-model:value="mysqlForm.port" :min="1" :max="65535" style="width: 100%" />
        <div class="port-status" :class="{ 'port-status--bad': portStatus && !portStatus.available }">
          {{ portStatusLabel }}
        </div>
      </div>
      <div>
        <div class="field-label">root 密码</div>
        <n-input v-model:value="mysqlForm.password" />
      </div>
    </div>

    <div v-else-if="mysqlStep === 3" class="wizard-pane">
      <div class="field-label">my.ini</div>
      <n-input v-model:value="mysqlIniPreview" type="textarea" :autosize="{ minRows: 18, maxRows: 24 }" />
    </div>

    <div v-else class="wizard-pane">
      <div class="ready-box">
        <div>安装目录：{{ mysqlForm.installDir }}</div>
        <div>服务：{{ mysqlForm.serviceName }} · {{ mysqlForm.host }}:{{ mysqlForm.port }}</div>
        <div>确认后会解压、初始化数据目录、注册并启动 Windows 服务。</div>
      </div>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <n-button :disabled="mysqlInstalling" @click="closeMysqlWizard">取消</n-button>
        <n-button v-if="mysqlStep > 1" :disabled="mysqlInstalling" @click="mysqlStep--">上一步</n-button>
        <n-button v-if="mysqlStep < 4" type="primary" :disabled="!canAdvanceMysqlStep" @click="mysqlStep++">下一步</n-button>
        <n-button v-else type="primary" :loading="mysqlInstalling" :disabled="!canStartMysqlInstall" @click="startMysqlLocalInstall">
          开始安装
        </n-button>
      </div>
    </template>
  </n-modal>

  <n-modal v-model:show="showRedisWizard" preset="card" title="Redis 本地安装" style="width: 820px" :mask-closable="false">
    <n-steps :current="redisStep" size="small" style="margin-bottom: 18px">
      <n-step title="解压位置" />
      <n-step title="服务配置" />
      <n-step title="预览配置" />
      <n-step title="开始安装" />
    </n-steps>

    <div v-if="redisStep === 1" class="wizard-pane">
      <div class="field-label">安装包</div>
      <div class="readonly-path">{{ cachedPackage?.filePath }}</div>
      <div class="field-label">默认解压位置</div>
      <div class="dir-row">
        <n-input v-model:value="redisForm.installDir" />
        <n-button @click="selectRedisInstallDir">选择</n-button>
      </div>
    </div>

    <div v-else-if="redisStep === 2" class="wizard-pane form-grid">
      <div>
        <div class="field-label">服务名</div>
        <n-input v-model:value="redisForm.serviceName" />
      </div>
      <div>
        <div class="field-label">IP</div>
        <n-input v-model:value="redisForm.host" />
      </div>
      <div>
        <div class="field-label">端口</div>
        <n-input-number v-model:value="redisForm.port" :min="1" :max="65535" style="width: 100%" />
        <div class="port-status" :class="{ 'port-status--bad': portStatus && !portStatus.available }">
          {{ portStatusLabel }}
        </div>
      </div>
      <div>
        <div class="field-label">访问密码</div>
        <n-input v-model:value="redisForm.password" />
      </div>
    </div>

    <div v-else-if="redisStep === 3" class="wizard-pane">
      <div class="field-label">redis.conf</div>
      <n-input v-model:value="redisConfigPreview" type="textarea" :autosize="{ minRows: 18, maxRows: 24 }" />
    </div>

    <div v-else class="wizard-pane">
      <div class="ready-box">
        <div>安装目录：{{ redisForm.installDir }}</div>
        <div>服务：{{ redisForm.serviceName }} · {{ redisForm.host }}:{{ redisForm.port }}</div>
        <div>确认后会解压、写入 redis.conf、注册并启动 Windows 服务。</div>
      </div>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <n-button :disabled="redisInstalling" @click="closeRedisWizard">取消</n-button>
        <n-button v-if="redisStep > 1" :disabled="redisInstalling" @click="redisStep--">上一步</n-button>
        <n-button v-if="redisStep < 4" type="primary" :disabled="!canAdvanceRedisStep" @click="redisStep++">下一步</n-button>
        <n-button v-else type="primary" :loading="redisInstalling" :disabled="!canStartRedisInstall" @click="startRedisLocalInstall">
          开始安装
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, h } from 'vue'
import { NTag, NButton, NSelect, NProgress, NTooltip, NIcon, NModal, NSteps, NStep, NInput, NInputNumber } from 'naive-ui'
import { CloudDownloadOutline } from '@vicons/ionicons5'
import { useToolsStore } from '../stores/tools'
import type { NodeVersion } from '../../../shared/types'

const props = defineProps<{ tool: any }>()

const store = useToolsStore()
const selectedVersion = ref(props.tool.versions[0]?.version ?? '')
const submitting = ref(false)
const submittingDownload = ref(false)

const dynamicVersions = ref<Array<{
  version: string
  date?: string
  lts?: string | boolean
  major?: number
  filename?: string
  downloadUrls?: Record<string, string>
}>>([])
const dynamicVersionsLoading = ref(false)
const selectedJdkVendor = ref('eclipse')
const jdkVendorOptions = ref<Array<{ label: string; value: string }>>([
  { label: 'Eclipse Temurin', value: 'eclipse' },
  { label: 'OpenJDK', value: 'openjdk' },
  { label: 'BellSoft Liberica', value: 'bellsoft' },
  { label: 'JetBrains Runtime', value: 'jetbrains' }
])
const jdkVendorLoading = ref(false)
const showNpmRegistryModal = ref(false)
const npmRegistryLoading = ref(false)
const settingNpmRegistry = ref(false)
const pendingRegistryUrl = ref('')
const npmRegistries = ref<Array<{ name: string; url: string; ok: boolean; latency: number | null; current: boolean }>>([])
const cachedPackage = ref<{ filePath: string; size: string } | null>(null)
const showMysqlWizard = ref(false)
const mysqlStep = ref(1)
const mysqlInstalling = ref(false)
const mysqlForm = ref({
  installDir: 'C:\\DevTools\\mysql',
  serviceName: 'MySQL',
  host: '127.0.0.1',
  port: 3306,
  password: '123456'
})
const mysqlIniPreview = ref('')
const showRedisWizard = ref(false)
const redisStep = ref(1)
const redisInstalling = ref(false)
const redisForm = ref({
  installDir: 'C:\\DevTools\\redis',
  serviceName: 'Redis',
  host: '127.0.0.1',
  port: 6379,
  password: '123456'
})
const redisConfigPreview = ref('')
const portChecking = ref(false)
const portStatus = ref<{ available: boolean; port: number; pid?: number; processName?: string; path?: string; state?: string } | null>(null)
let portCheckTimer: ReturnType<typeof setTimeout> | null = null

const DYNAMIC_TOOLS = ['nodejs', 'maven', 'jdk', 'python', 'mysql', 'git', 'codex', 'claude-code']
const isDynamic = computed(() => DYNAMIC_TOOLS.includes(props.tool.id))
const selectedFilename = computed(() => {
  const built = isDynamic.value ? buildDynamicUrls(selectedVersion.value) : undefined
  return built?.filename ?? props.tool.versions?.find((v: any) => v.version === selectedVersion.value)?.filename ?? ''
})
const showLocalInstall = computed(() => ['mysql', 'redis'].includes(props.tool.id) && !!cachedPackage.value)

const versionOptions = computed(() => {
  if (isDynamic.value && dynamicVersions.value.length) {
    return dynamicVersions.value.map((v) => ({
      label: v.version,
      value: v.version,
      date: v.date ?? '',
      lts: v.lts ?? false
    }))
  }
  return props.tool.versions.map((v: any) => ({ label: v.version, value: v.version, date: '', lts: false }))
})

function renderVersionLabel(option: any) {
  const ltsText = option.lts === true ? 'LTS' : option.lts ? `LTS · ${option.lts}` : null
  return h('div', { style: 'display:flex;align-items:center;gap:8px;padding:2px 0' }, [
    h('span', { style: 'font-family:monospace;font-size:13px' }, `v${option.value}`),
    ltsText
      ? h('span', {
          style: 'font-size:10px;background:#1a3a1a;color:#52c41a;padding:1px 5px;border-radius:3px'
        }, ltsText)
      : null,
    option.date
      ? h('span', { style: 'font-size:11px;color:#c0c0d0;margin-left:auto' }, option.date)
      : null
  ])
}

function buildDynamicUrls(version: string): { urls: Record<string, string>; filename?: string } | undefined {
  if (props.tool.id === 'jdk' || props.tool.id === 'git' || props.tool.id === 'python' || props.tool.id === 'mysql' || props.tool.id === 'codex' || props.tool.id === 'claude-code') {
    const ver = dynamicVersions.value.find((v) => v.version === version)
    if (ver?.downloadUrls) return { urls: { ...ver.downloadUrls }, filename: ver.filename }
    return undefined
  }
  if (props.tool.id === 'nodejs') {
    return {
      urls: {
        official: `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`,
        aliyun: `https://mirrors.aliyun.com/nodejs-release/v${version}/node-v${version}-win-x64.zip`,
        huawei: `https://repo.huaweicloud.com/nodejs/v${version}/node-v${version}-win-x64.zip`,
        tencent: `https://mirrors.cloud.tencent.com/nodejs-release/v${version}/node-v${version}-win-x64.zip`
      }
    }
  }
  if (props.tool.id === 'maven') {
    return {
      urls: {
        official: `https://downloads.apache.org/maven/maven-3/${version}/binaries/apache-maven-${version}-bin.zip`,
        aliyun: `https://mirrors.aliyun.com/apache/maven/maven-3/${version}/binaries/apache-maven-${version}-bin.zip`,
        huawei: `https://repo.huaweicloud.com/apache/maven/maven-3/${version}/binaries/apache-maven-${version}-bin.zip`,
        tencent: `https://mirrors.cloud.tencent.com/apache/maven/maven-3/${version}/binaries/apache-maven-${version}-bin.zip`
      }
    }
  }
  return undefined
}

onMounted(async () => {
  if (!isDynamic.value) return
  dynamicVersionsLoading.value = true
  try {
    let list: any[] = []
    if (props.tool.id === 'python') {
      list = await window.api.python.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'jdk') {
      jdkVendorLoading.value = true
      try {
        const vendors = await window.api.jdk.fetchVendors()
        if (vendors?.length) {
          jdkVendorOptions.value = vendors.map((v) => ({ label: v.name, value: v.id }))
          if (!vendors.find((v) => v.id === selectedJdkVendor.value)) {
            selectedJdkVendor.value = vendors[0].id
          }
        }
      } finally {
        jdkVendorLoading.value = false
      }
      list = await window.api.jdk.fetchVersions(selectedJdkVendor.value)
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'nodejs') {
      list = await window.api.nodejs.fetchVersions()
      const ltsFirst = list.find((v) => v.lts)
      selectedVersion.value = (ltsFirst ?? list[0])?.version ?? selectedVersion.value
    } else if (props.tool.id === 'maven') {
      list = await window.api.maven.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'mysql') {
      list = await window.api.mysql.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'git') {
      list = await window.api.git.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'codex') {
      list = await window.api.codex.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    } else if (props.tool.id === 'claude-code') {
      list = await window.api.claudeCode.fetchVersions()
      selectedVersion.value = list[0]?.version ?? selectedVersion.value
    }
    if (list.length) dynamicVersions.value = list
  } finally {
    dynamicVersionsLoading.value = false
  }
})

watch(
  [selectedVersion, dynamicVersions],
  () => {
    void refreshCachedPackage()
  },
  { deep: true, immediate: true }
)

watch(
  () => [...store.downloadTasks.values()]
    .filter((task) => task.toolId === props.tool.id && task.status === 'completed')
    .map((task) => `${task.version}:${task.filePath ?? ''}`)
    .join('|'),
  () => {
    void refreshCachedPackage()
  }
)

watch(
  mysqlForm,
  () => {
    mysqlIniPreview.value = buildMysqlIni()
  },
  { deep: true }
)

watch(
  redisForm,
  () => {
    redisConfigPreview.value = buildRedisConfig()
  },
  { deep: true }
)

watch(
  () => mysqlForm.value.port,
  () => {
    schedulePortCheck()
  }
)

watch(
  () => redisForm.value.port,
  () => {
    schedulePortCheck()
  }
)

async function handleJdkVendorChange(vendorId: string) {
  if (props.tool.id !== 'jdk') return
  dynamicVersionsLoading.value = true
  try {
    const list = await window.api.jdk.fetchVersions(vendorId)
    dynamicVersions.value = list
    selectedVersion.value = list[0]?.version ?? ''
  } finally {
    dynamicVersionsLoading.value = false
  }
}

const isInstalled = computed(() => !!props.tool.installed)

function compareVer(a: string, b: string): number {
  const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number)
  const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const versionDiff = computed(() => {
  if (!isInstalled.value) return 'none'
  const installed = props.tool.installed.version
  const selected = selectedVersion.value
  if (!installed || !selected) return 'none'
  const cmp = compareVer(selected, installed)
  if (cmp === 0) return 'same'
  return cmp > 0 ? 'upgrade' : 'downgrade'
})

const activeTask = computed(() =>
  [...store.downloadTasks.values()].find(
    (t) => t.toolId === props.tool.id && ['pending', 'downloading'].includes(t.status)
  )
)

const isDownloading = computed(() => !!activeTask.value)

function applyGithubProxyPreview(url: string) {
  const prefix = (store.settings?.githubProxyPrefix || 'https://gh.zwy.one').trim().replace(/\/+$/, '')
  if (!prefix || !/^https?:\/\/github\.com\//i.test(url)) return url
  return `${prefix}/${url.replace(/^https?:\/\//i, '')}`
}

const downloadUrlPreview = computed(() => {
  const mirror = (store.bestMirror ?? 'official') as string
  let url = ''
  if (isDynamic.value) {
    const built = buildDynamicUrls(selectedVersion.value)
    if (built?.urls) url = built.urls[mirror] ?? built.urls['official'] ?? Object.values(built.urls)[0] ?? ''
    return applyGithubProxyPreview(url)
  }
  const verCfg = props.tool.versions?.find((v: any) => v.version === selectedVersion.value)
    ?? props.tool.versions?.[0]
  if (verCfg?.downloadUrls) {
    const urls = verCfg.downloadUrls as Record<string, string>
    url = urls[mirror] ?? urls['official'] ?? Object.values(urls)[0] ?? ''
  }
  return applyGithubProxyPreview(url)
})

const progressStatus = computed(() => {
  if (!activeTask.value) return 'default'
  if (activeTask.value.status === 'error') return 'error'
  if (activeTask.value.status === 'completed') return 'success'
  return 'default'
})


const categoryLabel = computed(() => {
  const map: Record<string, string> = {
    backend: '后端',
    frontend: '前端',
    database: '数据库',
    ai: 'AI 工具',
    other: '其他'
  }
  return map[props.tool.category] ?? props.tool.category
})

const iconText = computed(() => {
  const map: Record<string, string> = {
    java: 'J',
    maven: 'Mvn',
    python: 'Py',
    nodejs: 'N',
    mysql: 'My',
    redis: 'R',
    claude: 'C',
    openai: 'AI',
    git: 'G',
    vscode: 'VS'
  }
  return map[props.tool.icon] ?? props.tool.icon[0].toUpperCase()
})

async function handleInstall() {
  window.api.log('info', `[ToolCard] handleInstall: tool=${props.tool.id} ver=${selectedVersion.value} submitting=${submitting.value} isDownloading=${isDownloading.value}`)
  if (submitting.value || isDownloading.value) {
    window.api.log('warn', `[ToolCard] handleInstall BLOCKED submitting=${submitting.value} isDownloading=${isDownloading.value}`)
    return
  }
  submitting.value = true
  try {
    const built =
      isDynamic.value && dynamicVersions.value.length
        ? buildDynamicUrls(selectedVersion.value)
        : undefined
    if (isDynamic.value && !built?.urls) {
      window.api.log('warn', `[ToolCard] no dynamic url resolved: tool=${props.tool.id} ver=${selectedVersion.value}`)
      return
    }
    window.api.log('info', `[ToolCard] startDownload isDynamic=${isDynamic.value} dynamicLen=${dynamicVersions.value.length} filename=${built?.filename} urls=${JSON.stringify(built?.urls)}`)
    const taskId = await store.startDownload(props.tool.id, selectedVersion.value, built?.urls, built?.filename)
    window.api.log('info', `[ToolCard] startDownload OK taskId=${taskId}`)
  } catch (err: any) {
    window.api.log('error', `[ToolCard] startDownload ERROR: ${err?.message ?? err}`)
  } finally {
    submitting.value = false
  }
}

async function handleDownloadOnly() {
  window.api.log('info', `[ToolCard] handleDownloadOnly: tool=${props.tool.id} ver=${selectedVersion.value} submittingDownload=${submittingDownload.value} isDownloading=${isDownloading.value}`)
  if (submittingDownload.value || isDownloading.value) {
    window.api.log('warn', `[ToolCard] handleDownloadOnly BLOCKED submittingDownload=${submittingDownload.value} isDownloading=${isDownloading.value}`)
    return
  }
  submittingDownload.value = true
  try {
    const built =
      isDynamic.value && dynamicVersions.value.length
        ? buildDynamicUrls(selectedVersion.value)
        : undefined
    if (isDynamic.value && !built?.urls) {
      window.api.log('warn', `[ToolCard] no dynamic url resolved(downloadOnly): tool=${props.tool.id} ver=${selectedVersion.value}`)
      return
    }
    window.api.log('info', `[ToolCard] startDownload(only) filename=${built?.filename} urls=${JSON.stringify(built?.urls)}`)
    const taskId = await store.startDownload(props.tool.id, selectedVersion.value, built?.urls, built?.filename, true)
    window.api.log('info', `[ToolCard] startDownload(only) OK taskId=${taskId}`)
  } catch (err: any) {
    window.api.log('error', `[ToolCard] startDownload(only) ERROR: ${err?.message ?? err}`)
  } finally {
    submittingDownload.value = false
  }
}

async function openNpmRegistryModal() {
  if (props.tool.id !== 'nodejs') return
  showNpmRegistryModal.value = true
  npmRegistryLoading.value = true
  try {
    npmRegistries.value = await window.api.npmRegistry.list()
  } finally {
    npmRegistryLoading.value = false
  }
}

async function applyNpmRegistry(url: string) {
  settingNpmRegistry.value = true
  pendingRegistryUrl.value = url
  try {
    await window.api.npmRegistry.set(url)
    npmRegistries.value = await window.api.npmRegistry.list()
  } finally {
    pendingRegistryUrl.value = ''
    settingNpmRegistry.value = false
  }
}

function normalizeIniPath(path: string) {
  return path.replace(/\\/g, '/')
}

function buildMysqlIni() {
  const installDir = normalizeIniPath(mysqlForm.value.installDir)
  return `[mysqld]
basedir=${installDir}
datadir=${installDir}/data
port=${mysqlForm.value.port || 3306}
bind-address=${mysqlForm.value.host || '127.0.0.1'}
character-set-server=utf8mb4
default-storage-engine=INNODB
default-time-zone='+08:00'
max_allowed_packet=999M
sql-mode=STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION

[client]
port=${mysqlForm.value.port || 3306}
default-character-set=utf8mb4

[mysql]
default-character-set=utf8mb4
`
}

function buildRedisConfig() {
  const installDir = normalizeIniPath(redisForm.value.installDir)
  const password = redisForm.value.password ? `requirepass ${redisForm.value.password}` : ''
  return `bind ${redisForm.value.host || '127.0.0.1'}
port ${redisForm.value.port || 6379}
protected-mode yes
daemonize no
dir ${installDir}
dbfilename dump.rdb
appendonly yes
appendfilename "appendonly.aof"
logfile "${installDir}/redis.log"
maxmemory-policy noeviction
${password}
`
}

async function refreshCachedPackage() {
  if (!['mysql', 'redis'].includes(props.tool.id)) return
  const filename = selectedFilename.value
  if (!filename) {
    cachedPackage.value = null
    return
  }
  cachedPackage.value = await window.api.download.findCached(filename)
}

function openLocalInstallWizard() {
  if (props.tool.id === 'mysql') openMysqlInstallWizard()
  else if (props.tool.id === 'redis') openRedisInstallWizard()
}

function openMysqlInstallWizard() {
  if (!cachedPackage.value) return
  mysqlStep.value = 1
  mysqlForm.value = {
    installDir: `C:\\DevTools\\mysql-${selectedVersion.value}`,
    serviceName: 'MySQL',
    host: '127.0.0.1',
    port: 3306,
    password: '123456'
  }
  mysqlIniPreview.value = buildMysqlIni()
  portStatus.value = null
  void checkLocalPort()
  showMysqlWizard.value = true
}

function openRedisInstallWizard() {
  if (!cachedPackage.value) return
  redisStep.value = 1
  redisForm.value = {
    installDir: `C:\\DevTools\\redis-${selectedVersion.value}`,
    serviceName: 'Redis',
    host: '127.0.0.1',
    port: 6379,
    password: '123456'
  }
  redisConfigPreview.value = buildRedisConfig()
  portStatus.value = null
  void checkLocalPort()
  showRedisWizard.value = true
}

function closeMysqlWizard() {
  if (mysqlInstalling.value) return
  showMysqlWizard.value = false
}

function closeRedisWizard() {
  if (redisInstalling.value) return
  showRedisWizard.value = false
}

async function selectMysqlInstallDir() {
  const selected = await window.api.dialog.selectDir(mysqlForm.value.installDir)
  if (selected) mysqlForm.value.installDir = selected
}

async function selectRedisInstallDir() {
  const selected = await window.api.dialog.selectDir(redisForm.value.installDir)
  if (selected) redisForm.value.installDir = selected
}

function schedulePortCheck() {
  if (portCheckTimer) clearTimeout(portCheckTimer)
  portCheckTimer = setTimeout(() => {
    void checkLocalPort()
  }, 350)
}

function activeLocalPort() {
  if (showRedisWizard.value) return Number(redisForm.value.port)
  return Number(mysqlForm.value.port)
}

async function checkLocalPort() {
  const port = activeLocalPort()
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    portStatus.value = { available: false, port, state: 'invalid' }
    return
  }
  portChecking.value = true
  try {
    portStatus.value = await window.api.network.checkPort(port)
  } finally {
    portChecking.value = false
  }
}

const portStatusLabel = computed(() => {
  if (portChecking.value) return '正在检测端口...'
  if (!portStatus.value) return '端口待检测'
  if (portStatus.value.available) return `端口 ${portStatus.value.port} 可用`
  if (portStatus.value.state === 'invalid') return '端口无效'
  const owner = portStatus.value.processName
    ? `${portStatus.value.processName}${portStatus.value.pid ? ` (PID ${portStatus.value.pid})` : ''}`
    : portStatus.value.pid
      ? `PID ${portStatus.value.pid}`
      : '未知进程'
  return `端口 ${portStatus.value.port} 已被占用：${owner}${portStatus.value.state ? ` · ${portStatus.value.state}` : ''}`
})

const canAdvanceMysqlStep = computed(() => {
  if (mysqlStep.value === 1) return !!cachedPackage.value?.filePath && !!mysqlForm.value.installDir
  if (mysqlStep.value === 2) return !!mysqlForm.value.serviceName && !!mysqlForm.value.host && !!mysqlForm.value.port && !!mysqlForm.value.password && !!portStatus.value?.available
  if (mysqlStep.value === 3) return !!mysqlIniPreview.value.trim()
  return true
})

const canStartMysqlInstall = computed(() => canAdvanceMysqlStep.value && !!cachedPackage.value?.filePath && !!mysqlIniPreview.value.trim())

const canAdvanceRedisStep = computed(() => {
  if (redisStep.value === 1) return !!cachedPackage.value?.filePath && !!redisForm.value.installDir
  if (redisStep.value === 2) return !!redisForm.value.serviceName && !!redisForm.value.host && !!redisForm.value.port && !!redisForm.value.password && !!portStatus.value?.available
  if (redisStep.value === 3) return !!redisConfigPreview.value.trim()
  return true
})

const canStartRedisInstall = computed(() => canAdvanceRedisStep.value && !!cachedPackage.value?.filePath && !!redisConfigPreview.value.trim())

async function startMysqlLocalInstall() {
  if (!cachedPackage.value || mysqlInstalling.value) return
  mysqlInstalling.value = true
  try {
    const taskId = await window.api.mysql.installLocal({
      version: selectedVersion.value,
      filePath: cachedPackage.value.filePath,
      installDir: mysqlForm.value.installDir,
      serviceName: mysqlForm.value.serviceName,
      host: mysqlForm.value.host,
      port: Number(mysqlForm.value.port || 3306),
      password: mysqlForm.value.password,
      myIni: mysqlIniPreview.value
    })
    window.api.log('info', `[ToolCard] mysql local install taskId=${taskId}`)
    showMysqlWizard.value = false
    await store.loadTools()
  } catch (err: any) {
    window.api.log('error', `[ToolCard] mysql local install ERROR: ${err?.message ?? err}`)
  } finally {
    mysqlInstalling.value = false
  }
}

async function startRedisLocalInstall() {
  if (!cachedPackage.value || redisInstalling.value) return
  redisInstalling.value = true
  try {
    const taskId = await window.api.redis.installLocal({
      version: selectedVersion.value,
      filePath: cachedPackage.value.filePath,
      installDir: redisForm.value.installDir,
      serviceName: redisForm.value.serviceName,
      host: redisForm.value.host,
      port: Number(redisForm.value.port || 6379),
      password: redisForm.value.password,
      configText: redisConfigPreview.value
    })
    window.api.log('info', `[ToolCard] redis local install taskId=${taskId}`)
    showRedisWizard.value = false
    await store.loadTools()
  } catch (err: any) {
    window.api.log('error', `[ToolCard] redis local install ERROR: ${err?.message ?? err}`)
  } finally {
    redisInstalling.value = false
  }
}

const canOpenPath = computed(() => {
  const p = props.tool.installed?.installPath
  return !!p && p !== 'system' && p !== 'global'
})

const pathLabel = computed(() => {
  const p = props.tool.installed?.installPath
  if (!p || p === 'system') return '系统 PATH（位置未知）'
  if (p === 'global') return 'npm 全局安装'
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p
})

const pathTooltip = computed(() => {
  const p = props.tool.installed?.installPath
  if (p === 'global') return 'npm 全局安装，路径由 npm 管理'
  if (p === 'system') return null
  return p
})

const systemPaths = computed<string[]>(() => {
  if (props.tool.installed?.installPath !== 'system') return []
  const exe = props.tool.installed?.exePath
  return exe ? [exe] : []
})

function dirOf(p: string): string {
  const normalized = p.replace(/\\/g, '/')
  return normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : p
}

async function handleUnmark() {
  await window.api.tools.unmark(props.tool.id)
  await store.loadTools()
}

function handleOpenDir() {
  if (!canOpenPath.value) return
  const p = props.tool.installed.installPath
  const isFile = /\.(exe|cmd|bat|sh|bin)$/i.test(p)
  window.api.tools.openDir(isFile ? dirOf(p) : p)
}
</script>

<style scoped>
.tool-card {
  background: #1a1a2e;
  border: 1px solid #2a2a40;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.tool-card:hover { border-color: #4a4a70; box-shadow: 0 4px 20px rgba(124, 106, 247, 0.1); }
.tool-card--installed { border-color: #1a3a1a; }

.card-header { display: flex; align-items: center; gap: 12px; }

.tool-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  background: #2d2557;
  color: #a89cff;
  flex-shrink: 0;
}
.icon-java { background: #3a1a1a; color: #ff8c69; }
.icon-maven { background: #3a1a2a; color: #ff6eb4; }
.icon-python { background: #1a2a3a; color: #69b4ff; }
.icon-nodejs { background: #1a3a1a; color: #69ff8c; }
.icon-mysql { background: #1a2c3a; color: #7cc8ff; }
.icon-redis { background: #3a1a1d; color: #ff7777; }
.icon-claude { background: #2d1a3a; color: #c469ff; }
.icon-openai { background: #1a2a2a; color: #69ffd4; }
.icon-git { background: #3a1a1a; color: #ff6980; }
.icon-vscode { background: #1a2a3a; color: #69c4ff; }

.tool-meta { flex: 1; min-width: 0; }
.tool-name { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.tool-category { font-size: 12px; color: #666; margin-top: 2px; }

.tool-desc { font-size: 13px; color: #888; line-height: 1.5; }

.installed-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.version-badge {
  display: inline-block;
  background: #1a3a1a;
  color: #52c41a;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  width: fit-content;
}
.install-path {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: #0f0f1a;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  width: fit-content;
  max-width: 100%;
}
.install-path--clickable {
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.install-path--clickable:hover {
  border-color: #7c6af7;
  background: #1e1a3a;
}
.install-path-icon { font-size: 12px; flex-shrink: 0; }
.install-path-text {
  font-size: 12px;
  color: #888;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.install-path--clickable .install-path-text { color: #a89cff; }

.card-footer { display: flex; align-items: center; gap: 8px; }
.vendor-select { width: 170px; flex-shrink: 0; }
.version-select { flex: 1; }

.download-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
}
.path-tooltip-system { font-size: 12px; min-width: 200px; }
.path-tooltip-title { color: #888; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.path-tooltip-paths { display: flex; flex-direction: column; gap: 3px; }
.path-tooltip-row { font-family: monospace; color: #a89cff; word-break: break-all; }
.path-tooltip-unknown { color: #666; font-style: italic; }

.url-tooltip {
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
  max-width: 360px;
  display: block;
}

.mirror-badge {
  background: #2a2a40;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #a89cff;
}

.npm-registry-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.npm-registry-head, .npm-registry-row {
  display: grid;
  grid-template-columns: 160px 1fr 130px 80px;
  gap: 10px;
  align-items: center;
}
.npm-registry-head { color: #8f8fa8; font-size: 12px; padding: 0 4px; }
.npm-registry-row {
  background: #171728;
  border: 1px solid #2b2b44;
  border-radius: 8px;
  padding: 8px 10px;
}
.npm-url { color: #a8a8c6; font-family: monospace; font-size: 12px; word-break: break-all; }
.ok { color: #52c41a; font-size: 12px; }
.bad { color: #ff7875; font-size: 12px; }
.current-pill {
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  background: #2a3f67;
  color: #91c0ff;
}

.wizard-pane { display: flex; flex-direction: column; gap: 10px; }
.field-label { font-size: 12px; color: #8f8fa8; }
.readonly-path {
  font-family: monospace;
  font-size: 12px;
  color: #a8a8c6;
  background: #11111f;
  border: 1px solid #2b2b44;
  border-radius: 6px;
  padding: 8px 10px;
  word-break: break-all;
}
.dir-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ready-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #c0c0d0;
  background: #11111f;
  border: 1px solid #2b2b44;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
}
.port-status {
  margin-top: 5px;
  min-height: 18px;
  color: #52c41a;
  font-size: 12px;
  line-height: 1.5;
}
.port-status--bad { color: #ff7875; }
.wizard-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
