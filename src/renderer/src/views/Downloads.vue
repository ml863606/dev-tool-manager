<template>
  <div class="downloads">
    <div class="page-header">
      <div>
        <h1>下载任务</h1>
        <p>实时查看下载与安装进度</p>
      </div>
    </div>

    <div v-if="tasks.length === 0" class="empty-state">
      <n-empty description="暂无下载任务" />
    </div>

    <div v-else class="task-list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-card"
        :class="`task-card--${task.status}`"
      >
        <div class="task-header">
          <div class="task-name">
            <span>{{ task.toolName }}</span>
            <span class="task-version">v{{ task.version }}</span>
            <span v-if="task.status === 'completed' && task.filePath" class="task-filename">
              {{ basename(task.filePath) }}
            </span>
          </div>
          <div class="task-header-right">
            <span v-if="task.startedAt" class="task-time">{{ formatTime(task.startedAt) }}</span>
            <span v-if="task.completedAt" class="task-duration">
              · 耗时 {{ duration(task.startedAt, task.completedAt) }}
            </span>
            <n-tag :type="statusType(task.status)" size="small">{{ statusLabel(task.status) }}</n-tag>
          </div>
        </div>

        <div v-if="task.downloadUrl" class="task-url">
          <span class="url-label">地址</span>
          <span class="url-value">{{ task.downloadUrl }}</span>
        </div>

        <div v-if="task.filePath" class="task-savedir">
          <span class="url-label">目录</span>
          <span class="url-value">{{ dirname(task.filePath) }}</span>
        </div>

        <n-progress
          v-if="task.status === 'downloading'"
          :percentage="task.progress"
          :status="progressStatus(task.status)"
          :show-indicator="true"
          style="margin: 10px 0 6px"
        />

        <div v-if="task.status === 'downloading'" class="task-meta">
          <span>{{ task.downloadedSize }} / {{ task.totalSize }}</span>
          <span>{{ task.speed }}</span>
          <span class="mirror-tag">{{ mirrorLabel(task.mirrorUsed) }}</span>
        </div>

        <div v-if="task.status === 'completed'" class="task-meta">
          <span>{{ task.totalSize }}</span>
          <span class="mirror-tag">{{ mirrorLabel(task.mirrorUsed) }}</span>
        </div>

        <div v-if="logs(task.id).length" class="task-log">
          <div v-for="(line, i) in logs(task.id)" :key="i" class="log-line">{{ line }}</div>
        </div>

        <div class="task-actions">
          <n-button v-if="task.status === 'downloading'" size="tiny" @click.stop="pauseTask(task.id)">
            暂停
          </n-button>
          <n-button
            v-if="task.status === 'error'"
            size="tiny"
            type="error"
            ghost
            @click.stop="removeTask(task.id)"
          >
            移除
          </n-button>
          <n-button
            v-if="task.status === 'completed' && task.filePath"
            size="tiny"
            type="primary"
            ghost
            @click.stop="openFile(task.filePath!)"
          >
            在文件夹中显示
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NTag, NProgress, NEmpty, NButton } from 'naive-ui'
import { useToolsStore } from '../stores/tools'
import { MIRROR_LABELS } from '../../../shared/tools.config'

const store = useToolsStore()

const tasks = computed(() => [...store.downloadTasks.values()].reverse())

function logs(taskId: string) {
  return store.installLogs.get(taskId) ?? []
}

function basename(filePath: string) {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}

function dirname(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.substring(0, normalized.lastIndexOf('/')) || filePath
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function duration(startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return ''
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中', downloading: '下载中',
    completed: '已完成', error: '出错', paused: '已暂停'
  }
  return map[status] ?? status
}

function statusType(status: string): any {
  const map: Record<string, string> = {
    pending: 'default', downloading: 'info',
    completed: 'success', error: 'error', paused: 'warning'
  }
  return map[status] ?? 'default'
}

function progressStatus(status: string): any {
  if (status === 'error') return 'error'
  if (status === 'completed') return 'success'
  return 'default'
}

function mirrorLabel(mirror: string) {
  return MIRROR_LABELS[mirror] ?? mirror
}

async function pauseTask(taskId: string) {
  await window.api.download.pause(taskId)
}

async function openFile(filePath: string) {
  await window.api.download.openFile(filePath)
}

function removeTask(taskId: string) {
  store.removeTask(taskId)
}
</script>

<style scoped>
.downloads { padding: 28px 32px; }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 22px; font-weight: 700; color: #e0e0e0; }
.page-header p { font-size: 13px; color: #666; margin-top: 4px; }

.task-list { display: flex; flex-direction: column; gap: 12px; }

.task-card {
  background: #1a1a2e;
  border: 1px solid #2a2a40;
  border-radius: 10px;
  padding: 16px;
  cursor: default;
}
.task-card--completed { border-color: #1a3a1a; }
.task-card--error     { border-color: #3a1a1a; }

.task-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.task-name { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; color: #e0e0e0; flex: 1; min-width: 0; }
.task-version { font-size: 12px; color: #666; font-family: monospace; }
.task-filename { font-size: 11px; color: #888; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.task-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.task-time { font-size: 12px; color: #888; }
.task-duration { font-size: 12px; color: #52c41a; }

.task-url, .task-savedir {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}
.url-label {
  color: #555;
  flex-shrink: 0;
  font-size: 11px;
  background: #2a2a40;
  padding: 1px 5px;
  border-radius: 3px;
}
.url-value {
  color: #7a7aaa;
  font-family: monospace;
  word-break: break-all;
  line-height: 1.5;
}

.task-meta { display: flex; gap: 16px; font-size: 12px; color: #666; margin-top: 8px; }
.mirror-tag { background: #2a2a40; color: #a89cff; padding: 1px 6px; border-radius: 4px; }

.task-log {
  margin-top: 10px;
  background: #0f0f1a;
  border-radius: 6px;
  padding: 8px 12px;
  max-height: 120px;
  overflow-y: auto;
}
.log-line { font-size: 12px; color: #52c41a; font-family: monospace; line-height: 1.6; }

.task-actions { margin-top: 10px; display: flex; gap: 8px; }

.empty-state { padding: 80px; text-align: center; }
</style>
