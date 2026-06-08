<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <div class="titlebar-drag" />
      <div class="app-shell">
        <aside class="sidebar">
          <div class="logo">
            <span class="logo-icon">⚙</span>
            <span class="logo-text">DevTools</span>
          </div>
          <nav class="nav">
            <router-link to="/" class="nav-item" active-class="nav-item--active">
              <n-icon :component="GridOutline" size="18" />
              <span>工具库</span>
            </router-link>
            <router-link to="/downloads" class="nav-item" active-class="nav-item--active">
              <n-icon :component="CloudDownloadOutline" size="18" />
              <span>下载任务</span>
              <n-badge v-if="activeCount > 0" :value="activeCount" type="info" />
            </router-link>
            <router-link to="/settings" class="nav-item" active-class="nav-item--active">
              <n-icon :component="SettingsOutline" size="18" />
              <span>设置</span>
            </router-link>
          </nav>
          <div class="mirror-status">
            <div class="mirror-dot" :class="mirrorClass" />
            <span>{{ mirrorLabel }}</span>
          </div>
        </aside>
        <main class="main-content">
          <router-view />
        </main>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { darkTheme } from 'naive-ui'
import { NConfigProvider, NMessageProvider, NIcon, NBadge } from 'naive-ui'
import { GridOutline, CloudDownloadOutline, SettingsOutline } from '@vicons/ionicons5'
import { useToolsStore } from './stores/tools'

const themeOverrides = {
  common: {
    primaryColor: '#7c6af7',
    primaryColorHover: '#9985ff',
    primaryColorPressed: '#6554e0',
    borderRadius: '8px'
  }
}

const store = useToolsStore()

const activeCount = computed(() =>
  [...store.downloadTasks.values()].filter((t) => t.status === 'downloading').length
)

const mirrorLabel = computed(() => {
  const m = store.bestMirror
  const map: Record<string, string> = {
    official: '官方源',
    aliyun: '阿里云',
    huawei: '华为云',
    tencent: '腾讯云',
    auto: '检测中...'
  }
  return map[m] ?? m
})

const mirrorClass = computed(() => ({
  'mirror-dot--green': ['aliyun', 'huawei', 'tencent'].includes(store.bestMirror),
  'mirror-dot--blue': store.bestMirror === 'official',
  'mirror-dot--gray': store.bestMirror === 'auto'
}))

onMounted(async () => {
  store.setupListeners()
  await Promise.all([store.loadTools(), store.loadSettings(), store.detectMirror()])
})
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0f0f1a; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; }

.titlebar-drag {
  height: 40px;
  width: 100%;
  -webkit-app-region: drag;
  background: #1a1a2e;
  flex-shrink: 0;
}

.app-shell {
  display: flex;
  height: calc(100vh - 40px);
  overflow: hidden;
}

.sidebar {
  width: 200px;
  min-width: 200px;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  border-right: 1px solid #2a2a40;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px 24px;
}
.logo-icon { font-size: 24px; }
.logo-text { font-size: 16px; font-weight: 700; color: #7c6af7; }

.nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #9090a8;
  text-decoration: none;
  font-size: 14px;
  transition: all 0.15s;
  position: relative;
}
.nav-item:hover { background: #2a2a40; color: #e0e0e0; }
.nav-item--active { background: #2d2557; color: #a89cff; }

.mirror-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #666;
  border-top: 1px solid #2a2a40;
  margin-top: 8px;
  padding-top: 16px;
}

.mirror-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #444;
}
.mirror-dot--green { background: #52c41a; }
.mirror-dot--blue { background: #1890ff; }
.mirror-dot--gray { background: #888; }

.main-content {
  flex: 1;
  overflow-y: auto;
  background: #0f0f1a;
}
</style>
