<template>
  <div class="dashboard">
    <div class="page-header">
      <div>
        <h1>工具库</h1>
        <p>管理你的开发环境工具</p>
      </div>
      <div class="header-actions">
        <n-input
          v-model:value="search"
          placeholder="搜索工具..."
          clearable
          size="small"
          style="width: 200px"
        />
        <n-button type="primary" size="small" :loading="detecting" :disabled="detecting" @click="handleAutoDetect">
          重新检测已安装
        </n-button>
        <n-button type="warning" size="small" :disabled="detecting" @click="handleClearAndDetect">
          清除缓存重检
        </n-button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-num">{{ totalCount }}</span>
        <span class="stat-label">全部工具</span>
      </div>
      <div class="stat-item">
        <span class="stat-num installed">{{ installedCount }}</span>
        <span class="stat-label">已安装</span>
      </div>
      <div class="stat-item">
        <span class="stat-num pending">{{ pendingCount }}</span>
        <span class="stat-label">未安装</span>
      </div>

      <div v-if="detecting || detectLogs.length > 0" class="detect-status">
        <div class="detect-current" v-if="detecting">
          <span class="detect-spinner" />
          <span>{{ currentDetecting }}</span>
        </div>
        <div class="detect-log-list">
          <div
            v-for="log in detectLogs"
            :key="log.toolId"
            class="detect-log-item"
            :class="`detect-log-item--${log.status}`"
          >
            <span class="detect-log-icon">{{ log.status === 'found' ? '✓' : '✗' }}</span>
            <span class="detect-log-name">{{ log.toolName }}</span>
            <span v-if="log.version" class="detect-log-version">{{ log.version }}</span>
          </div>
        </div>
      </div>
    </div>

    <n-tabs v-model:value="activeTab" type="line" animated>
      <n-tab-pane
        v-for="tab in tabs"
        :key="tab.value"
        :name="tab.value"
        :tab="tab.label"
      >
        <div class="tools-grid" v-if="filteredTools.length > 0">
          <tool-card v-for="tool in filteredTools" :key="tool.id" :tool="tool" />
        </div>
        <div v-else class="empty-state">
          <n-empty description="没有匹配的工具" />
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NInput, NButton, NTabs, NTabPane, NEmpty } from 'naive-ui'
import { useToolsStore } from '../stores/tools'
import ToolCard from '../components/ToolCard.vue'

const store = useToolsStore()
const search = ref('')
const activeTab = ref('all')
const detecting = ref(false)
const currentDetecting = ref('')
const detectLogs = ref<Array<{ toolId: string; toolName: string; status: 'found' | 'not_found'; version?: string }>>([])

const tabs = [
  { label: '全部', value: 'all' },
  { label: '后端', value: 'backend' },
  { label: '前端', value: 'frontend' },
  { label: '数据库', value: 'database' },
  { label: 'AI 工具', value: 'ai' },
  { label: '其他', value: 'other' }
]

const filteredTools = computed(() => {
  return store.toolList.filter((tool) => {
    const matchSearch =
      !search.value ||
      tool.name.toLowerCase().includes(search.value.toLowerCase()) ||
      tool.description.includes(search.value)
    const matchCategory = activeTab.value === 'all' || tool.category === activeTab.value
    return matchSearch && matchCategory
  })
})

const totalCount = computed(() => store.toolList.length)
const installedCount = computed(() => store.toolList.filter((t) => t.installed).length)
const pendingCount = computed(() => store.toolList.filter((t) => !t.installed).length)

let removeProgressListener: (() => void) | null = null

function setupProgressListener() {
  removeProgressListener = window.api.tools.onDetectProgress((data: any) => {
    if (data.status === 'checking') {
      currentDetecting.value = `正在检测 ${data.toolName}...`
    } else if (data.status === 'found') {
      detectLogs.value.push({ toolId: data.toolId, toolName: data.toolName, status: 'found', version: data.version })
    } else if (data.status === 'not_found') {
      detectLogs.value.push({ toolId: data.toolId, toolName: data.toolName, status: 'not_found' })
    } else if (data.status === 'done') {
      currentDetecting.value = ''
      detecting.value = false
      store.loadTools()
    }
  })
}

async function handleAutoDetect() {
  detecting.value = true
  detectLogs.value = []
  currentDetecting.value = '准备检测...'
  store.autoDetect()
}

async function handleClearAndDetect() {
  await window.api.tools.clearCache()
  await store.loadTools()
  handleAutoDetect()
}

onMounted(async () => {
  setupProgressListener()
  await store.loadTools()
  handleAutoDetect()
})

onUnmounted(() => {
  removeProgressListener?.()
})
</script>

<style scoped>
.dashboard { padding: 28px 32px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-header h1 { font-size: 22px; font-weight: 700; color: #e0e0e0; }
.page-header p { font-size: 13px; color: #666; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.stats-bar {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #1a1a2e;
  border-radius: 10px;
  border: 1px solid #2a2a40;
  flex-wrap: wrap;
}
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat-num { font-size: 24px; font-weight: 700; color: #e0e0e0; }
.stat-num.installed { color: #52c41a; }
.stat-num.pending { color: #888; }
.stat-label { font-size: 12px; color: #666; }

.detect-status {
  flex: 1;
  border-left: 1px solid #2a2a40;
  padding-left: 20px;
  min-width: 0;
}

.detect-current {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #a89cff;
  margin-bottom: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
.detect-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #a89cff44;
  border-top-color: #a89cff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.detect-log-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detect-log-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
  background: #0f0f1a;
  border: 1px solid #2a2a40;
}
.detect-log-item--found { border-color: #1a3a1a; }
.detect-log-item--not_found { border-color: #2a2a2a; opacity: 0.5; }

.detect-log-icon { font-size: 11px; }
.detect-log-item--found .detect-log-icon { color: #52c41a; }
.detect-log-item--not_found .detect-log-icon { color: #555; }

.detect-log-name { color: #c0c0d0; }
.detect-log-version {
  color: #52c41a;
  font-family: monospace;
  font-size: 11px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding-top: 16px;
}
.empty-state { padding: 60px; text-align: center; }
</style>
