import { ipcMain } from 'electron'
import axios from 'axios'
import log from 'electron-log'

const jdkVendors = [
  { id: 'openjdk', name: 'OpenJDK', distribution: 'openjdk' },
  { id: 'eclipse', name: 'Eclipse Temurin', distribution: 'temurin' },
  { id: 'bellsoft', name: 'BellSoft Liberica', distribution: 'liberica' },
  { id: 'jetbrains', name: 'JetBrains Runtime', distribution: 'jetbrains' }
] as const

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchFoojayPackages(params: Record<string, string>, retries = 3): Promise<any[]> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get('https://api.foojay.io/disco/v3.0/packages', {
        timeout: 12000,
        params
      })
      return (res.data?.result ?? []) as any[]
    } catch (e: any) {
      lastErr = e
      const status = e?.response?.status
      const retryable = e?.code === 'ECONNABORTED' || status === 429 || status === 502 || status === 503 || status === 504
      if (!retryable || i === retries - 1) break
      await sleep(600 * (i + 1))
    }
  }
  throw lastErr
}

export function registerJdkHandlers(): void {
  ipcMain.handle('jdk:fetchVendors', async () => jdkVendors.map((v) => ({ id: v.id, name: v.name })))

  ipcMain.handle('jdk:fetchVersions', async (_event, vendorId?: string) => {
    const vendor = jdkVendors.find((v) => v.id === (vendorId || 'bellsoft')) ?? jdkVendors[2]
    try {
      let items: any[] = []
      const baseParams = {
        distribution: vendor.distribution,
        operating_system: 'windows',
        archive_type: 'zip',
        package_type: 'jdk',
        latest: 'available',
        release_status: 'ga',
        term_of_support: 'lts'
      }
      const archCandidates = vendor.id === 'bellsoft' ? ['amd64', 'x64'] : ['x64', 'amd64']
      let lastErr: any
      for (const arch of archCandidates) {
        try {
          items = await fetchFoojayPackages({ ...baseParams, architecture: arch }, 3)
          if (items.length) break
        } catch (e: any) {
          lastErr = e
        }
      }
      if (!items.length && vendor.id === 'eclipse') {
        try {
          const releasesRes = await axios.get('https://api.adoptium.net/v3/info/available_releases', { timeout: 10000 })
          const ltsVersions = [...(releasesRes.data.available_lts_releases as number[])].reverse()
          const fallbackResults: any[] = []
          for (const major of ltsVersions) {
            try {
              const r = await axios.get(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot`, {
                params: { architecture: 'x64', image_type: 'jdk', os: 'windows', vendor: 'eclipse' },
                timeout: 10000
              })
              const first = (r.data as any[])?.[0]
              if (!first) continue
              fallbackResults.push({
                version: `${first.version.major}.${first.version.minor}.${first.version.security}`,
                lts: true,
                major,
                filename: first.binary.package.name,
                downloadUrls: {
                  official: first.binary.package.link,
                  aliyun: first.binary.package.link,
                  huawei: first.binary.package.link,
                  tencent: first.binary.package.link
                }
              })
            } catch {}
          }
          if (fallbackResults.length) {
            log.info(`[jdk versions] vendor=${vendor.id} foojay失败，adoptium回退成功 ${fallbackResults.length} 个版本`)
            return fallbackResults
          }
        } catch {}
      }
      if (!items.length && lastErr) throw lastErr

      const seenVersions = new Set<string>()
      const list = items
        .filter((i) => i?.links?.pkg_download_redirect && i?.filename)
        .sort((a, b) => Number(b.major_version || 0) - Number(a.major_version || 0))
        .map((i) => {
          const version = String(i.distribution_version || i.java_version || i.major_version)
          const filename = String(i.filename)
          const officialUrl = String(i.links.pkg_download_redirect)
          const major = Number(i.major_version || 0)
          const tsinghuaAdoptium = `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jdk/x64/windows/${filename}`
          const ustcAdoptium = `https://mirrors.ustc.edu.cn/adoptium/${major}/jdk/x64/windows/${filename}`
          const isEclipseTemurin = vendor.id === 'eclipse'
          return {
            version,
            lts: i.term_of_support === 'lts',
            major,
            filename,
            downloadUrls: {
              official: officialUrl,
              aliyun: isEclipseTemurin ? tsinghuaAdoptium : officialUrl,
              huawei: isEclipseTemurin ? ustcAdoptium : officialUrl,
              tencent: isEclipseTemurin ? tsinghuaAdoptium : officialUrl
            }
          }
        })
        .filter((item) => item.lts === true)
        .filter((item) => {
          if (seenVersions.has(item.version)) return false
          seenVersions.add(item.version)
          return true
        })
        .slice(0, 20)
      log.info(`[jdk versions] vendor=${vendor.id} 成功，共 ${list.length} 个版本`)
      return list
    } catch (e: any) {
      log.warn(`[jdk versions] vendor=${vendor.id} 获取失败: ${e.message}`)
      return []
    }
  })
}
