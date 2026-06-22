<template>
  <div class="tool-card" :class="{ 'tool-card--installed': isInstalled }">
    <div class="card-header">
      <div class="tool-icon">
        <img v-if="logoUrl" :src="logoUrl" :alt="`${tool.name} logo`" class="tool-logo" />
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

    <div v-if="hasSpecialActions" class="special-actions">
      <n-button
        v-if="props.tool.id === 'nodejs'"
        size="small"
        :loading="npmRegistryLoading"
        :disabled="npmRegistryLoading"
        @click="openNpmRegistryModal"
      >
        设置 npm 源
      </n-button>
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
          <div v-if="canOpenCachedPackageDir" class="local-install-stack">
            <n-button size="small" type="primary" ghost :disabled="isDownloading" @click="openLocalInstallWizard">
              本地安装
            </n-button>
            <button
              class="cached-package-link"
              type="button"
              :title="cachedPackage?.filePath"
              @click.stop="openCachedPackageDir"
            >
              <span class="cached-package-link__icon">📦</span>
              <span>打开下载目录</span>
            </button>
          </div>
          <n-button v-else size="small" type="primary" ghost :disabled="isDownloading" @click="openLocalInstallWizard">
            本地安装
          </n-button>
        </template>
        <span class="url-tooltip">{{ cachedPackage?.filePath }}</span>
      </n-tooltip>
      <template v-if="!isInstalled">
        <n-tooltip placement="top" :delay="300" :disabled="!downloadUrlPreview">
          <template #trigger>
            <n-button type="primary" size="small" :loading="submitting || isDownloading" :disabled="submitting || isDownloading" @click="handleInstall">
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

  <MavenInstallWizard
    v-model:show="showMavenWizard"
    :version="selectedVersion"
    :package-path="cachedPackage?.filePath"
    :install-base-dir="store.settings?.installBaseDir"
    @installed="handleLocalInstallFinished"
  />

  <MysqlInstallWizard
    v-model:show="showMysqlWizard"
    :version="selectedVersion"
    :package-path="cachedPackage?.filePath"
    :install-base-dir="store.settings?.installBaseDir"
    @installed="handleLocalInstallFinished"
  />

  <RedisInstallWizard
    v-model:show="showRedisWizard"
    :version="selectedVersion"
    :package-path="cachedPackage?.filePath"
    :install-base-dir="store.settings?.installBaseDir"
    @installed="handleLocalInstallFinished"
  />

  <n-modal v-model:show="showGitConfirm" preset="card" title="Git 本地重新安装" style="width: 640px" :mask-closable="!gitInstalling">
    <div class="wizard-pane">
      <div class="field-label">安装包</div>
      <div class="readonly-path">{{ cachedPackage?.filePath }}</div>
      <div class="field-label">安装目录</div>
      <div class="dir-row">
        <n-input v-model:value="gitForm.installDir" />
        <n-button :disabled="gitInstalling" @click="selectGitInstallDir">选择</n-button>
      </div>
      <div class="field-hint">
        将使用已下载的 Git 安装包重新执行静默安装。安装过程中不会弹出 Git 官方安装向导，请在下方任务日志查看进度。
      </div>
    </div>
    <template #footer>
      <div class="modal-actions">
        <n-button :disabled="gitInstalling" @click="closeGitConfirm">取消</n-button>
        <n-button type="primary" :loading="gitInstalling" :disabled="!cachedPackage?.filePath || !gitForm.installDir" @click="startGitLocalInstall">
          开始重新安装
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, h } from 'vue'
import { NTag, NButton, NSelect, NProgress, NTooltip, NIcon, NModal, NInput } from 'naive-ui'
import { CloudDownloadOutline } from '@vicons/ionicons5'
import { useToolsStore } from '../stores/tools'
import MavenInstallWizard from './backend/maven/MavenInstallWizard.vue'
import MysqlInstallWizard from './db/mysql/MysqlInstallWizard.vue'
import RedisInstallWizard from './db/redis/RedisInstallWizard.vue'
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
const selectedJdkVendor = ref('bellsoft')
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
const showMavenWizard = ref(false)
const showMysqlWizard = ref(false)
const showRedisWizard = ref(false)
const showGitConfirm = ref(false)
const gitInstalling = ref(false)
const gitForm = ref({
  installDir: 'C:\\DevTools\\git'
})

const DYNAMIC_TOOLS = ['nodejs', 'maven', 'jdk', 'python', 'mysql', 'git', 'codex', 'claude-code']
const isDynamic = computed(() => DYNAMIC_TOOLS.includes(props.tool.id))
const hasSpecialActions = computed(() => props.tool.id === 'nodejs')
const selectedFilename = computed(() => {
  const built = isDynamic.value ? buildDynamicUrls(selectedVersion.value) : undefined
  return built?.filename ?? props.tool.versions?.find((v: any) => v.version === selectedVersion.value)?.filename ?? ''
})
const showLocalInstall = computed(() => ['maven', 'mysql', 'redis', 'git'].includes(props.tool.id) && !!cachedPackage.value)
const canOpenCachedPackageDir = computed(() => ['mysql', 'redis', 'git'].includes(props.tool.id) && !!cachedPackage.value?.filePath)

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
  const prefix = (store.settings?.githubProxyPrefix || 'https://cdn.akaere.online').trim().replace(/\/+$/, '')
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

const logoModules = import.meta.glob('../assets/logo/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const logoUrl = computed(() => logoModules[`../assets/logo/${props.tool.icon}.svg`] ?? '')

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
    const forceDownload = showLocalInstall.value
    window.api.log('info', `[ToolCard] startDownload isDynamic=${isDynamic.value} dynamicLen=${dynamicVersions.value.length} filename=${built?.filename} force=${forceDownload} urls=${JSON.stringify(built?.urls)}`)
    const taskId = await store.startDownload(props.tool.id, selectedVersion.value, built?.urls, built?.filename, false, undefined, forceDownload)
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

async function refreshCachedPackage() {
  if (!['maven', 'mysql', 'redis', 'git'].includes(props.tool.id)) return
  const filename = selectedFilename.value
  if (!filename) {
    cachedPackage.value = null
    return
  }
  cachedPackage.value = await window.api.download.findCached(filename)
}

function openLocalInstallWizard() {
  if (props.tool.id === 'maven') openMavenInstallWizard()
  else if (props.tool.id === 'mysql') openMysqlInstallWizard()
  else if (props.tool.id === 'redis') openRedisInstallWizard()
  else if (props.tool.id === 'git') {
    openGitInstallConfirm()
  }
}

function openMavenInstallWizard() {
  if (!cachedPackage.value) return
  showMavenWizard.value = true
}

function openGitInstallConfirm() {
  if (!cachedPackage.value) return
  gitForm.value = {
    installDir: `${(store.settings?.installBaseDir || 'C:\\DevTools').replace(/\\+$/, '')}\\git`
  }
  showGitConfirm.value = true
}

function openMysqlInstallWizard() {
  if (!cachedPackage.value) return
  showMysqlWizard.value = true
}

function openRedisInstallWizard() {
  if (!cachedPackage.value) return
  showRedisWizard.value = true
}

function closeGitConfirm() {
  if (gitInstalling.value) return
  showGitConfirm.value = false
}

async function selectGitInstallDir() {
  const selected = await window.api.dialog.selectDir(gitForm.value.installDir)
  if (selected) gitForm.value.installDir = selected
}

async function openCachedPackageDir() {
  const packagePath = cachedPackage.value?.filePath
  if (!packagePath) return
  window.api.log('info', `[ToolCard] open cached package directory: ${packagePath}`)
  await window.api.download.openDirOfFile(packagePath)
}

async function handleLocalInstallFinished() {
  await store.loadTools()
}

async function startGitLocalInstall() {
  if (!cachedPackage.value || gitInstalling.value || !gitForm.value.installDir) return
  gitInstalling.value = true
  try {
    const built =
      isDynamic.value && dynamicVersions.value.length
        ? buildDynamicUrls(selectedVersion.value)
        : undefined
    const taskId = await store.startDownload(props.tool.id, selectedVersion.value, built?.urls, built?.filename, false, gitForm.value.installDir)
    window.api.log('info', `[ToolCard] git local reinstall taskId=${taskId} file=${cachedPackage.value.filePath} installDir=${gitForm.value.installDir}`)
    showGitConfirm.value = false
  } catch (err: any) {
    window.api.log('error', `[ToolCard] git local reinstall ERROR: ${err?.message ?? err}`)
  } finally {
    gitInstalling.value = false
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
  overflow: hidden;
  min-width: 0;
}
.tool-card:hover { border-color: #4a4a70; box-shadow: 0 4px 20px rgba(124, 106, 247, 0.1); }
.tool-card--installed { border-color: #1a3a1a; }

.card-header { display: flex; align-items: center; gap: 12px; }

.tool-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f8;
  border: 1px solid #ffffff18;
  flex-shrink: 0;
}
.tool-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}

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

.special-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.vendor-select {
  width: 160px;
  max-width: 100%;
  flex: 0 1 160px;
}
.version-select {
  flex: 1 1 160px;
  min-width: 0;
  max-width: 100%;
}

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

.local-install-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.cached-package-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 24px;
  border: 1px solid #353557;
  border-radius: 999px;
  padding: 3px 9px;
  background: linear-gradient(180deg, rgba(42, 42, 64, 0.92), rgba(22, 22, 35, 0.92));
  color: #c8c5ff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.cached-package-link:hover {
  border-color: #6f63d8;
  background: linear-gradient(180deg, rgba(59, 55, 95, 0.98), rgba(31, 29, 52, 0.98));
  color: #ffffff;
  transform: translateY(-1px);
}

.cached-package-link__icon {
  font-size: 12px;
  line-height: 1;
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
.wizard-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
