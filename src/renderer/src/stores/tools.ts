import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings, DownloadTask } from '../../../shared/types'

export const useToolsStore = defineStore('tools', () => {
  const toolList = ref<any[]>([])
  const settings = ref<AppSettings | null>(null)
  const downloadTasks = ref<Map<string, DownloadTask>>(new Map())
  const installLogs = ref<Map<string, string[]>>(new Map())
  const bestMirror = ref<string>('huawei')

  function persistTasks() {
    void window.api.taskCache.save({
      downloadTasks: [...downloadTasks.value.entries()],
      installLogs: [...installLogs.value.entries()]
    })
  }

  async function restoreTasks() {
    try {
      const cache = await window.api.taskCache.get()
      downloadTasks.value = new Map(cache?.downloadTasks ?? [])
      installLogs.value = new Map(cache?.installLogs ?? [])
    } catch {
      // ignore restore errors
    }
  }

  async function loadTools() {
    toolList.value = await window.api.tools.list()
  }

  async function autoDetect() {
    toolList.value = await window.api.tools.autoDetect()
  }

  async function loadSettings() {
    settings.value = await window.api.settings.get()
  }

  async function saveSettings(s: AppSettings) {
    const plain = JSON.parse(JSON.stringify(s))
    await window.api.settings.save(plain)
    settings.value = s
  }

  async function detectMirror() {
    bestMirror.value = await window.api.network.detect()
  }

  async function startDownload(toolId: string, version: string, dynamicUrls?: Record<string, string>, dynamicFilename?: string, downloadOnly?: boolean) {
    const taskId = await window.api.download.start({ toolId, version, dynamicUrls, dynamicFilename, downloadOnly } as any)
    return taskId
  }

  function updateTask(task: DownloadTask) {
    const next = new Map(downloadTasks.value)
    next.set(task.id, { ...next.get(task.id), ...task })
    downloadTasks.value = next
    persistTasks()
  }

  function appendLog(taskId: string, msg: string) {
    const next = new Map(installLogs.value)
    const lines = [...(next.get(taskId) ?? []), msg]
    next.set(taskId, lines)
    installLogs.value = next
    persistTasks()
  }

  function removeTask(taskId: string) {
    const nextTasks = new Map(downloadTasks.value)
    nextTasks.delete(taskId)
    downloadTasks.value = nextTasks

    const nextLogs = new Map(installLogs.value)
    nextLogs.delete(taskId)
    installLogs.value = nextLogs
    persistTasks()
  }

  function setupListeners() {
    void restoreTasks()

    window.api.download.onProgress((task) => {
      updateTask(task)
    })

    window.api.download.onInstallStatus(({ taskId, msg }) => {
      appendLog(taskId, msg)
    })

    window.api.download.onInstallComplete(async (data) => {
      appendLog(data.taskId, data.success ? `安装成功: ${data.installPath}` : `安装失败: ${data.error}`)
      await loadTools()
    })
  }

  return {
    toolList,
    settings,
    downloadTasks,
    installLogs,
    bestMirror,
    loadTools,
    autoDetect,
    loadSettings,
    saveSettings,
    detectMirror,
    startDownload,
    removeTask,
    setupListeners
  }
})
