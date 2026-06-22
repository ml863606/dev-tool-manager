<template>
  <n-modal v-model:show="visible" preset="card" title="Maven 本地安装" style="width: 860px" :mask-closable="!installing">
    <n-steps :current="step" size="small" style="margin-bottom: 18px">
      <n-step title="安装位置" />
      <n-step title="仓库配置" />
      <n-step title="预览配置" />
      <n-step title="开始安装" />
    </n-steps>

    <div v-if="step === 1" class="wizard-pane">
      <div class="field-label">安装包</div>
      <div class="readonly-path">{{ packagePath }}</div>
      <div class="field-label">安装目录</div>
      <div class="dir-row">
        <n-input v-model:value="form.installDir" />
        <n-button :disabled="installing" @click="selectInstallDir">选择</n-button>
      </div>
    </div>

    <div v-else-if="step === 2" class="wizard-pane">
      <div class="field-label">远程仓库镜像</div>
      <n-select v-model:value="form.mirrorId" :options="mavenMirrorOptions" />
      <div class="config-visible-box">
        <div>镜像名称：{{ selectedMirror.label }}</div>
        <div>镜像地址：{{ selectedMirror.url }}</div>
      </div>
      <div class="field-label">依赖存放位置（localRepository）</div>
      <div class="dir-row">
        <n-input v-model:value="form.repositoryDir" />
        <n-button :disabled="installing" @click="selectRepositoryDir">选择</n-button>
      </div>
    </div>

    <div v-else-if="step === 3" class="wizard-pane">
      <div class="field-label">conf/settings.xml</div>
      <n-input v-model:value="settingsPreview" type="textarea" :autosize="{ minRows: 18, maxRows: 24 }" />
    </div>

    <div v-else class="wizard-pane">
      <div class="ready-box">
        <div>安装包：{{ packagePath }}</div>
        <div>安装目录：{{ form.installDir }}</div>
        <div>依赖仓库：{{ form.repositoryDir }}</div>
        <div>远程镜像：{{ selectedMirror.label }} · {{ selectedMirror.url }}</div>
        <div>确认后会解压 Maven、写入 settings.xml，并配置 MAVEN_HOME 与 PATH。</div>
      </div>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <n-button :disabled="installing" @click="close">取消</n-button>
        <n-button v-if="step > 1" :disabled="installing" @click="step--">上一步</n-button>
        <n-button v-if="step < 4" type="primary" :disabled="!canAdvanceStep" @click="step++">下一步</n-button>
        <n-button v-else type="primary" :loading="installing" :disabled="!canStartInstall" @click="startInstall">
          开始安装
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NInput, NModal, NSelect, NStep, NSteps } from 'naive-ui'

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
  installDir: 'C:\\DevTools\\maven',
  repositoryDir: 'C:\\DevTools\\maven-repository',
  mirrorId: 'huawei'
})
const settingsPreview = ref('')

const mavenMirrorOptions = [
  { label: '华为云 Maven', value: 'huawei', url: 'https://repo.huaweicloud.com/repository/maven/' },
  { label: '腾讯云 Maven', value: 'tencent', url: 'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/' },
  { label: '阿里云 Maven', value: 'aliyun', url: 'https://maven.aliyun.com/repository/public' }
]
const selectedMirror = computed(() => mavenMirrorOptions.find((item) => item.value === form.value.mirrorId) ?? mavenMirrorOptions[0])
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

watch(form, () => {
  settingsPreview.value = buildMavenSettings()
}, { deep: true })

function installBaseDir() {
  return (props.installBaseDir || 'C:\\DevTools').replace(/\\+$/, '')
}

function buildMavenSettings() {
  const repositoryDir = form.value.repositoryDir.replace(/\\/g, '/')
  const mirror = selectedMirror.value
  return `<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">
  <localRepository>${repositoryDir}</localRepository>

  <mirrors>
    <mirror>
      <id>${mirror.value}</id>
      <name>${mirror.label}</name>
      <url>${mirror.url}</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>
</settings>
`
}

function openWizard() {
  step.value = 1
  form.value = {
    installDir: `${installBaseDir()}\\maven-${props.version}`,
    repositoryDir: `${installBaseDir()}\\maven-repository`,
    mirrorId: 'huawei'
  }
  settingsPreview.value = buildMavenSettings()
}

function close() {
  if (installing.value) return
  visible.value = false
}

async function selectInstallDir() {
  const selected = await window.api.dialog.selectDir(form.value.installDir)
  if (selected) form.value.installDir = selected
}

async function selectRepositoryDir() {
  const selected = await window.api.dialog.selectDir(form.value.repositoryDir)
  if (selected) form.value.repositoryDir = selected
}

const canAdvanceStep = computed(() => {
  if (step.value === 1) return !!props.packagePath && !!form.value.installDir
  if (step.value === 2) return !!form.value.repositoryDir && !!selectedMirror.value?.url
  if (step.value === 3) return !!settingsPreview.value.trim()
  return true
})

const canStartInstall = computed(() =>
  canAdvanceStep.value
  && !!props.packagePath
  && !!form.value.installDir
  && !!form.value.repositoryDir
  && !!settingsPreview.value.trim()
)

async function startInstall() {
  if (!props.packagePath || installing.value) return
  installing.value = true
  try {
    const mirror = selectedMirror.value
    const taskId = await window.api.maven.installLocal({
      version: props.version,
      filePath: props.packagePath,
      installDir: form.value.installDir,
      repositoryDir: form.value.repositoryDir,
      mirrorId: mirror.value as 'huawei' | 'tencent' | 'aliyun',
      mirrorName: mirror.label,
      mirrorUrl: mirror.url,
      settingsXml: settingsPreview.value
    })
    window.api.log('info', `[MavenInstallWizard] local install taskId=${taskId}`)
    visible.value = false
    emit('installed')
  } catch (err: any) {
    window.api.log('error', `[MavenInstallWizard] local install ERROR: ${err?.message ?? err}`)
  } finally {
    installing.value = false
  }
}
</script>

<style scoped>
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
.config-visible-box {
  color: #c0c0d0;
  background: #11111f;
  border: 1px solid #2b2b44;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
.wizard-footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
