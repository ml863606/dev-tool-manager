import axios from 'axios'
import type { MirrorRegion, ToolVersion } from '../shared/types'

const PROBE_URLS: Record<MirrorRegion | 'official', string> = {
  official: 'https://nodejs.org/dist/',
  aliyun: 'https://mirrors.tuna.tsinghua.edu.cn',
  huawei: 'https://repo.huaweicloud.com',
  tencent: 'https://mirrors.tuna.tsinghua.edu.cn'
}

export async function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await axios.head(url, { timeout: timeoutMs, validateStatus: (s) => s < 400 })
    return true
  } catch {
    return false
  }
}

export interface ProbeResult {
  region: MirrorRegion | 'official'
  url: string
  ok: boolean
  latency: number | null
}

export async function probeAll(timeoutMs = 3000): Promise<ProbeResult[]> {
  const probes = Object.entries(PROBE_URLS).map(async ([region, url]) => {
    const start = Date.now()
    const ok = await probeUrl(url, timeoutMs)
    const latency = Date.now() - start
    return { region: region as MirrorRegion | 'official', url, ok, latency }
  })
  return Promise.all(probes)
}

export async function detectBestMirror(timeoutMs = 3000): Promise<MirrorRegion | 'official'> {
  const results = await probeAll(timeoutMs)
  const available = results.filter((r) => r.ok).sort((a, b) => (a.latency ?? 9999) - (b.latency ?? 9999))
  return available.length === 0 ? 'aliyun' : available[0].region
}

export async function resolveBestDownloadUrl(
  version: ToolVersion,
  preferred: MirrorRegion | 'auto',
  timeoutMs = 3000
): Promise<{ url: string; mirror: MirrorRegion | 'official' }> {
  const order: Array<MirrorRegion | 'official'> =
    preferred === 'auto'
      ? ['aliyun', 'huawei', 'tencent', 'official']
      : [preferred as MirrorRegion | 'official', 'aliyun', 'huawei', 'tencent', 'official']

  for (const mirror of order) {
    const url = version.downloadUrls[mirror]
    if (!url || url.startsWith('npm:')) {
      return { url, mirror }
    }
    const reachable = await probeUrl(url, timeoutMs)
    if (reachable) {
      return { url, mirror }
    }
  }

  const fallback = order[0]
  return { url: version.downloadUrls[fallback], mirror: fallback }
}
