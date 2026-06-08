<template>
  <div class="ports">
    <div class="page-header">
      <div>
        <h1>端口占用</h1>
        <p>查看本机端口与进程占用情况</p>
      </div>
      <div class="header-actions">
        <n-input
          v-model:value="query"
          placeholder="输入端口、服务名或进程名"
          clearable
          size="small"
          style="width: 280px"
        />
        <n-button type="primary" size="small" :loading="loading" @click="loadPorts">
          刷新
        </n-button>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-num">{{ rows.length }}</span>
        <span class="stat-label">全部记录</span>
      </div>
      <div class="stat-item">
        <span class="stat-num listening">{{ listeningCount }}</span>
        <span class="stat-label">监听中</span>
      </div>
      <div class="stat-item">
        <span class="stat-num matched">{{ filteredRows.length }}</span>
        <span class="stat-label">匹配结果</span>
      </div>
    </div>

    <div class="table-wrap">
      <n-data-table
        :columns="columns"
        :data="filteredRows"
        :loading="loading"
        :pagination="{ pageSize: 15 }"
        size="small"
        striped
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NDataTable, NInput, NTag } from 'naive-ui'

interface PortRow {
  port: number
  localAddress: string
  remoteAddress?: string
  remotePort?: number
  state: string
  pid: number
  processName?: string
  path?: string
}

const query = ref('')
const loading = ref(false)
const rows = ref<PortRow[]>([])

const listeningCount = computed(() => rows.value.filter((row) => row.state.toLowerCase() === 'listening' || row.state.toLowerCase() === 'listen').length)

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) => {
    const fields = [
      row.port,
      row.localAddress,
      row.remoteAddress,
      row.remotePort,
      row.state,
      row.pid,
      row.processName,
      row.path
    ].map((v) => String(v ?? '').toLowerCase())
    return fields.some((field) => field.includes(q))
  })
})

const columns = [
  {
    title: '端口',
    key: 'port',
    width: 90,
    sorter: (a: PortRow, b: PortRow) => a.port - b.port
  },
  {
    title: '状态',
    key: 'state',
    width: 120,
    render(row: PortRow) {
      const normalized = row.state.toLowerCase()
      const type = ['listen', 'listening'].includes(normalized) ? 'success' : normalized === 'established' ? 'info' : 'default'
      return h(NTag, { size: 'small', type }, { default: () => stateLabel(row.state) })
    }
  },
  {
    title: '进程',
    key: 'processName',
    width: 180,
    render(row: PortRow) {
      return h('div', { class: 'process-cell' }, [
        h('span', { class: 'process-name' }, row.processName || '未知进程'),
        h('span', { class: 'pid' }, `PID ${row.pid}`)
      ])
    }
  },
  {
    title: '本地地址',
    key: 'localAddress',
    width: 180,
    render(row: PortRow) {
      return h('span', { class: 'mono' }, `${row.localAddress}:${row.port}`)
    }
  },
  {
    title: '远程地址',
    key: 'remoteAddress',
    width: 180,
    render(row: PortRow) {
      const remote = row.remoteAddress && row.remotePort ? `${row.remoteAddress}:${row.remotePort}` : '-'
      return h('span', { class: 'mono muted' }, remote)
    }
  },
  {
    title: '路径',
    key: 'path',
    ellipsis: { tooltip: true },
    render(row: PortRow) {
      return h('span', { class: 'mono path-text' }, row.path || '-')
    }
  }
] as any

function stateLabel(state: string) {
  const normalized = state.toLowerCase()
  const map: Record<string, string> = {
    Listen: '监听',
    LISTENING: '监听',
    Established: '已连接',
    ESTABLISHED: '已连接',
    TimeWait: '等待关闭',
    TIME_WAIT: '等待关闭',
    CloseWait: '等待关闭',
    CLOSE_WAIT: '等待关闭',
    Bound: '已绑定'
  }
  return map[state] ?? map[normalized] ?? state
}

async function loadPorts() {
  loading.value = true
  try {
    rows.value = await window.api.network.listPorts()
  } finally {
    loading.value = false
  }
}

onMounted(loadPorts)
</script>

<style scoped>
.ports { padding: 28px 32px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.page-header h1 { font-size: 22px; font-weight: 700; color: #e0e0e0; }
.page-header p { font-size: 13px; color: #666; margin-top: 4px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 16px;
  padding: 14px 18px;
  background: #1a1a2e;
  border-radius: 8px;
  border: 1px solid #2a2a40;
}
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat-num { font-size: 22px; font-weight: 700; color: #e0e0e0; }
.stat-num.listening { color: #52c41a; }
.stat-num.matched { color: #a89cff; }
.stat-label { font-size: 12px; color: #666; }

.table-wrap {
  background: #1a1a2e;
  border: 1px solid #2a2a40;
  border-radius: 8px;
  padding: 10px;
}
.process-cell { display: flex; flex-direction: column; gap: 2px; }
.process-name { color: #e0e0e0; }
.pid { color: #777; font-size: 11px; font-family: monospace; }
.mono { font-family: monospace; font-size: 12px; }
.muted { color: #777; }
.path-text { color: #9a9ab8; }
</style>
