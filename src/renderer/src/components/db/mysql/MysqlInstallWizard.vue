<template>
  <n-modal v-model:show="visible" preset="card" title="MySQL 本地安装" style="width: 820px" :mask-closable="false">
    <n-steps :current="step" size="small" style="margin-bottom: 18px">
      <n-step title="解压位置" />
      <n-step title="服务配置" />
      <n-step title="预览配置" />
      <n-step title="开始安装" />
    </n-steps>

    <div v-if="step === 1" class="wizard-pane">
      <div class="field-label">安装包</div>
      <div class="readonly-path">{{ packagePath }}</div>
      <div class="field-label">默认解压位置</div>
      <div class="dir-row">
        <n-input v-model:value="form.installDir" />
        <n-button @click="selectInstallDir">选择</n-button>
      </div>
    </div>

    <div v-else-if="step === 2" class="wizard-pane form-grid">
      <div>
        <div class="field-label">服务名</div>
        <n-input v-model:value="form.serviceName" />
      </div>
      <div>
        <div class="field-label">IP</div>
        <n-input v-model:value="form.host" />
      </div>
      <div>
        <div class="field-label">端口</div>
        <n-input-number v-model:value="form.port" :min="1" :max="65535" style="width: 100%" />
        <div class="port-status" :class="{ 'port-status--bad': portStatus && !portStatus.available }">
          {{ portStatusLabel }}
        </div>
      </div>
      <div>
        <div class="field-label">root 密码</div>
        <n-input v-model:value="form.password" />
      </div>
    </div>

    <div v-else-if="step === 3" class="wizard-pane">
      <div class="field-label">my.ini</div>
      <n-input v-model:value="myIniPreview" type="textarea" :autosize="{ minRows: 18, maxRows: 24 }" />
    </div>

    <div v-else class="wizard-pane">
      <div class="ready-box">
        <div class="summary-row summary-row--plain">
          <span class="summary-label">本地安装包</span>
          <span class="summary-value summary-path">{{ packagePath }}</span>
          <n-button size="tiny" tertiary @click="openPackageDir">打开目录</n-button>
        </div>
        <div class="summary-row">
          <span class="summary-label">安装位置</span>
          <span class="summary-value summary-path">{{ form.installDir }}</span>
        </div>
        <div class="summary-grid">
          <div><span>服务名</span><strong>{{ form.serviceName }}</strong></div>
          <div><span>IP</span><strong>{{ form.host }}</strong></div>
          <div><span>端口</span><strong>{{ form.port }}</strong></div>
          <div><span>用户名</span><strong>root</strong></div>
          <div><span>密码</span><strong>{{ form.password || '空' }}</strong></div>
        </div>
        <div>确认后会解压、初始化数据目录、注册并启动 Windows 服务。</div>
      </div>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <n-button :disabled="installing" @click="close">取消</n-button>
        <n-button v-if="step > 1" :disabled="installing" @click="step--">上一步</n-button>
        <n-button v-if="step < 4" type="primary" :disabled="!canAdvance" @click="step++">下一步</n-button>
        <n-button v-else type="primary" :loading="installing" :disabled="!canStartInstall" @click="startInstall">
          开始安装
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NInputNumber, NModal, NStep, NSteps } from 'naive-ui'

const props = defineProps<{
  show: boolean
  version: string
  packagePath?: string
  installBaseDir?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  installed: []
}>()

const step = ref(1)
const installing = ref(false)
const form = ref({
  installDir: 'C:\\DevTools\\mysql',
  serviceName: 'MySQL',
  host: '127.0.0.1',
  port: 3306,
  password: '123456'
})
const myIniPreview = ref('')
const portChecking = ref(false)
const portStatus = ref<{ available: boolean; port: number; pid?: number; processName?: string; path?: string; state?: string } | null>(null)
let portCheckTimer: ReturnType<typeof setTimeout> | null = null

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

watch(
  () => props.show,
  (show) => {
    if (!show) return
    openWizard()
  }
)

watch(
  form,
  () => {
    myIniPreview.value = buildMysqlIni()
  },
  { deep: true }
)

watch(
  () => form.value.port,
  () => {
    schedulePortCheck()
  }
)

function installBaseDir() {
  return (props.installBaseDir || 'C:\\DevTools').replace(/\\+$/, '')
}

function normalizeIniPath(path: string) {
  return path.replace(/\\/g, '/')
}

function buildMysqlIni() {
  const installDir = normalizeIniPath(form.value.installDir)
  return `[mysqld]
basedir=${installDir}
datadir=${installDir}/data
port=${form.value.port || 3306}
bind-address=${form.value.host || '127.0.0.1'}
character-set-server=utf8mb4
default-storage-engine=INNODB
default-time-zone='+08:00'
max_allowed_packet=999M
sql-mode=STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION

[client]
port=${form.value.port || 3306}
default-character-set=utf8mb4

[mysql]
default-character-set=utf8mb4
`
}

function openWizard() {
  step.value = 1
  form.value = {
    installDir: `${installBaseDir()}\\mysql-${props.version}`,
    serviceName: 'MySQL',
    host: '127.0.0.1',
    port: 3306,
    password: '123456'
  }
  myIniPreview.value = buildMysqlIni()
  portStatus.value = null
  void checkLocalPort()
}

function close() {
  if (installing.value) return
  visible.value = false
}

async function selectInstallDir() {
  const selected = await window.api.dialog.selectDir(form.value.installDir)
  if (selected) form.value.installDir = selected
}

async function openPackageDir() {
  if (!props.packagePath) return
  await window.api.download.openDirOfFile(props.packagePath)
}

function schedulePortCheck() {
  if (portCheckTimer) clearTimeout(portCheckTimer)
  portCheckTimer = setTimeout(() => {
    void checkLocalPort()
  }, 350)
}

async function checkLocalPort() {
  const port = Number(form.value.port)
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

const canAdvance = computed(() => {
  if (step.value === 1) return !!props.packagePath && !!form.value.installDir
  if (step.value === 2) return !!form.value.serviceName && !!form.value.host && !!form.value.port && !!form.value.password && !!portStatus.value?.available
  if (step.value === 3) return !!myIniPreview.value.trim()
  return true
})

const canStartInstall = computed(() => canAdvance.value && !!props.packagePath && !!myIniPreview.value.trim())

async function startInstall() {
  if (!props.packagePath || installing.value) return
  installing.value = true
  try {
    const taskId = await window.api.mysql.installLocal({
      version: props.version,
      filePath: props.packagePath,
      installDir: form.value.installDir,
      serviceName: form.value.serviceName,
      host: form.value.host,
      port: Number(form.value.port || 3306),
      password: form.value.password,
      myIni: myIniPreview.value
    })
    window.api.log('info', `[MysqlInstallWizard] local install taskId=${taskId}`)
    visible.value = false
    emit('installed')
  } catch (err: any) {
    window.api.log('error', `[MysqlInstallWizard] local install ERROR: ${err?.message ?? err}`)
  } finally {
    installing.value = false
  }
}
</script>

<style scoped>
.wizard-pane { display: flex; flex-direction: column; gap: 10px; }
.field-label { font-size: 12px; color: #8f8fa8; }
.readonly-path {
  background: #11111d;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  padding: 8px 10px;
  color: #c8c8d8;
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}
.dir-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ready-box {
  background: #11111d;
  border: 1px solid #2a2a40;
  border-radius: 8px;
  padding: 12px;
  color: #c8c8d8;
  font-size: 13px;
  line-height: 1.8;
}
.summary-row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.summary-row--plain {
  grid-template-columns: 82px minmax(0, 1fr);
}
.summary-label,
.summary-grid span {
  color: #8f8fa8;
}
.summary-value,
.summary-grid strong {
  color: #e0e0ea;
  font-weight: 500;
}
.summary-path {
  font-family: monospace;
  word-break: break-all;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
}
.summary-grid div {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  gap: 8px;
}
.port-status {
  margin-top: 5px;
  color: #8f8fa8;
  font-size: 11px;
}
.port-status--bad { color: #ff7875; }
.wizard-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
