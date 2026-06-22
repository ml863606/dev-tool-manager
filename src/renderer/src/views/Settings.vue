<template>
  <div class="settings">
    <div class="page-header">
      <h1>设置</h1>
      <p>配置下载源和安装目录</p>
    </div>

    <div v-if="form" class="settings-form" style="padding-bottom: 64px">
      <div class="section">
        <div class="section-title">目录设置</div>
        <div class="field">
          <label>统一安装根目录</label>
          <div class="dir-picker">
            <n-input
              v-model:value="form.installBaseDir"
              placeholder="C:\DevTools"
              readonly
              class="dir-input"
            />
            <n-button @click="selectInstallDir" :loading="selectingInstallDir">浏览...</n-button>
          </div>
          <div class="field-hint">所有工具将安装在此目录的子目录中，例如 {{ form.installBaseDir }}\jdk-21</div>
        </div>
        <div class="field">
          <label>下载缓存目录</label>
          <div class="dir-picker">
            <n-input
              v-model:value="form.downloadDir"
              placeholder="C:\DevTools\_downloads"
              readonly
              class="dir-input"
            />
            <n-button @click="selectDownloadDir" :loading="selectingDownloadDir">浏览...</n-button>
          </div>
          <div class="field-hint">安装包下载后暂存于此目录，安装完成后可手动清理</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">下载源设置</div>
        <div class="field">
          <label>首选镜像源</label>
          <n-select v-model:value="form.preferredMirror" :options="mirrorOptions" />
          <div class="field-hint">选择"自动"时，程序会探测各源连通性并选择最快的可用源</div>
        </div>
        <div class="field">
          <label>GitHub 镜像下载前缀</label>
          <n-input
            v-model:value="form.githubProxyPrefix"
            placeholder="https://cdn.akaere.online"
            clearable
          />
          <div class="field-hint">GitHub 下载地址会自动拼接为：{{ githubProxyExample }}</div>
        </div>
        <div class="field">
          <label>连通性探测超时 (ms)</label>
          <n-input-number v-model:value="form.probeTimeoutMs" :min="500" :max="10000" :step="500" style="width: 100%" />
        </div>
        <div class="field">
          <label>最大并发下载数</label>
          <n-input-number v-model:value="form.concurrentDownloads" :min="1" :max="5" style="width: 100%" />
        </div>
      </div>

      <div class="section">
        <div class="section-title">网络探测</div>
        <div class="probe-result">
          <div class="probe-sources">
            <n-tooltip
              v-for="source in probeResults"
              :key="source.region"
              placement="top"
              :show-arrow="true"
            >
              <template #trigger>
                <div
                  class="probe-item"
                  :class="{
                    'probe-item--best': source.region === store.bestMirror,
                    'probe-item--probing': probing && source.latency === null
                  }"
                >
                  <div class="probe-dot" :class="probeClass(source)" />
                  <span class="probe-label">{{ source.label }}</span>
                  <span class="probe-latency" :class="{ 'probe-latency--fail': source.probed && !source.ok }">
                    {{ !source.probed ? (probing ? '...' : '—') : `${source.latency}ms` }}
                  </span>
                  <span v-if="source.region === store.bestMirror" class="probe-best-tag">最优</span>
                </div>
              </template>
              <div class="probe-tooltip">
                <div class="probe-tooltip-url">{{ source.url }}</div>
                <div class="probe-tooltip-status">
                  {{ !source.probed ? (probing ? '探测中...' : '未探测') : source.ok ? `连通，延迟 ${source.latency}ms` : `不可达，超时 ${source.latency}ms` }}
                </div>
              </div>
            </n-tooltip>
          </div>
          <n-button size="small" :loading="probing" @click="runProbe">重新探测</n-button>
        </div>
      </div>

    </div>
    <div v-if="form" class="form-actions">
      <n-button type="primary" :loading="saving" @click="handleSave">保存设置</n-button>
      <n-button @click="resetForm">还原</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { NInput, NInputNumber, NSelect, NButton, NTooltip, useMessage } from 'naive-ui'
import { useToolsStore } from '../stores/tools'
import type { AppSettings } from '../../../shared/types'

const PROBE_LABELS: Record<string, string> = {
  official: '官方源',
  aliyun: '阿里云',
  huawei: '华为云',
  tencent: '腾讯云'
}

const store = useToolsStore()
const message = useMessage()
const saving = ref(false)
const probing = ref(false)
const selectingInstallDir = ref(false)
const selectingDownloadDir = ref(false)
const form = ref<AppSettings | null>(null)

const githubProxyExample = computed(() => {
  const prefix = (form.value?.githubProxyPrefix || 'https://cdn.akaere.online').trim().replace(/\/+$/, '')
  return `${prefix}/github.com/redis-windows/redis-windows/releases/download/8.8.0/Redis-8.8.0-Windows-x64-msys2-with-Service.zip`
})

const mirrorOptions = [
  { label: '自动探测', value: 'auto' },
  { label: '阿里云镜像', value: 'aliyun' },
  { label: '华为云镜像', value: 'huawei' },
  { label: '腾讯云镜像', value: 'tencent' },
  { label: '官方源', value: 'official' }
]

const probeResults = ref<Array<{ region: string; label: string; url: string; ok: boolean; latency: number | null; probed: boolean }>>([
  { region: 'official', label: '官方源', url: 'https://nodejs.org/dist/', ok: false, latency: null, probed: false },
  { region: 'aliyun', label: '阿里云', url: 'https://mirrors.aliyun.com', ok: false, latency: null, probed: false },
  { region: 'huawei', label: '华为云', url: 'https://repo.huaweicloud.com', ok: false, latency: null, probed: false },
  { region: 'tencent', label: '腾讯云', url: 'https://mirrors.cloud.tencent.com', ok: false, latency: null, probed: false }
])

function probeClass(source: { ok: boolean; probed: boolean }) {
  if (!source.probed) return probing.value ? 'probe-dot--pulsing' : ''
  return source.ok ? 'probe-dot--green' : 'probe-dot--red'
}

async function selectInstallDir() {
  if (!form.value) return
  selectingInstallDir.value = true
  try {
    const selected = await window.api.dialog.selectDir(form.value.installBaseDir)
    if (selected) form.value.installBaseDir = selected
  } finally {
    selectingInstallDir.value = false
  }
}

async function selectDownloadDir() {
  if (!form.value) return
  selectingDownloadDir.value = true
  try {
    const selected = await window.api.dialog.selectDir(form.value.downloadDir)
    if (selected) form.value.downloadDir = selected
  } finally {
    selectingDownloadDir.value = false
  }
}

async function runProbe() {
  probing.value = true
  probeResults.value.forEach((s) => { s.latency = null; s.ok = false; s.probed = false })
  try {
    const results = await window.api.network.probeAll()
    results.forEach((r) => {
      const item = probeResults.value.find((s) => s.region === r.region)
      if (item) {
        item.ok = r.ok
        item.latency = r.latency
        item.url = r.url
        item.label = PROBE_LABELS[r.region] ?? r.region
        item.probed = true
      }
    })
    const best = results.filter((r) => r.ok).sort((a, b) => (a.latency ?? 9999) - (b.latency ?? 9999))[0]
    if (best) store.bestMirror = best.region
  } finally {
    probing.value = false
  }
}

async function handleSave() {
  if (!form.value) return
  saving.value = true
  try {
    form.value.githubProxyPrefix = (form.value.githubProxyPrefix || 'https://cdn.akaere.online').trim().replace(/\/+$/, '')
    await store.saveSettings(form.value)
    message.success('设置已保存')
  } catch (err: any) {
    message.error(`保存失败: ${err?.message ?? '未知错误'}`)
  } finally {
    saving.value = false
  }
}

function resetForm() {
  if (store.settings) {
    form.value = { ...store.settings }
  }
}

onMounted(async () => {
  await store.loadSettings()
  form.value = store.settings ? { ...store.settings } : null
})
</script>

<style scoped>
.settings { padding: 28px 32px; max-width: 720px; }

.page-header { margin-bottom: 28px; }
.page-header h1 { font-size: 22px; font-weight: 700; color: #e0e0e0; }
.page-header p { font-size: 13px; color: #666; margin-top: 4px; }

.settings-form { display: flex; flex-direction: column; gap: 24px; }

.section {
  background: #1a1a2e;
  border: 1px solid #2a2a40;
  border-radius: 10px;
  padding: 20px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #a89cff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.field label { font-size: 14px; color: #c0c0d0; }
.field-hint { font-size: 12px; color: #555; }

.dir-picker { display: flex; gap: 8px; align-items: center; }
.dir-input { flex: 1; }

.probe-result { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.probe-sources { display: flex; gap: 12px; flex-wrap: wrap; flex: 1; }

.probe-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #0f0f1a;
  border-radius: 6px;
  border: 1px solid #2a2a40;
  font-size: 13px;
}
.probe-item--best { border-color: #7c6af7; background: #1e1a3a; }

.probe-dot { width: 8px; height: 8px; border-radius: 50%; background: #444; }
.probe-dot--green { background: #52c41a; }
.probe-dot--red { background: #ff4d4f; }

.probe-label { color: #c0c0d0; }
.probe-latency { color: #666; font-size: 12px; font-family: monospace; min-width: 48px; }
.probe-latency--fail { color: #ff4d4f; text-decoration: line-through; }

.probe-item--probing { opacity: 0.6; }

.probe-best-tag {
  font-size: 10px;
  background: #7c6af7;
  color: #fff;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 2px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.probe-dot--pulsing {
  background: #888;
  animation: pulse 1s ease-in-out infinite;
}

.probe-tooltip { font-size: 12px; max-width: 340px; }
.probe-tooltip-url {
  font-family: monospace;
  color: #a89cff;
  word-break: break-all;
  margin-bottom: 4px;
}
.probe-tooltip-status { color: #aaa; }

.form-actions {
  position: fixed;
  bottom: 0;
  left: 200px;
  right: 0;
  display: flex;
  gap: 12px;
  padding: 12px 32px;
  background: #0f0f1a;
  border-top: 1px solid #2a2a40;
  z-index: 10;
}
</style>
