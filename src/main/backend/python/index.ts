import { ipcMain } from 'electron'
import axios from 'axios'
import log from 'electron-log'

export function registerPythonHandlers(): void {
  ipcMain.handle('python:fetchVersions', async () => {
    const mirrorUrls = [
      'https://mirrors.tuna.tsinghua.edu.cn/python/',
      'https://repo.huaweicloud.com/python/',
      'https://www.python.org/ftp/python/'
    ]

    const MONTH: Record<string, string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
    }
    function normalizeDate(raw: string): string {
      const m = raw.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
      if (m) return `${m[3]}-${MONTH[m[2]] ?? '01'}-${m[1]}`
      return raw
    }

    const mirrors = {
      official: 'https://www.python.org/ftp/python',
      aliyun: 'https://mirrors.tuna.tsinghua.edu.cn/python',
      huawei: 'https://repo.huaweicloud.com/python',
      tencent: 'https://mirrors.tuna.tsinghua.edu.cn/python'
    } as const

    for (const url of mirrorUrls) {
      try {
        log.info(`[python versions] 尝试: ${url}`)
        const res = await axios.get<string>(url, { timeout: 6000 })
        const html = res.data as string
        const lineRe = /href="(3\.\d+\.\d+)\/[^"]*"[^\n]*?(\d{2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2})/g
        const versionDateMap: Record<string, string> = {}
        let lm: RegExpExecArray | null
        while ((lm = lineRe.exec(html)) !== null) {
          const ver = lm[1].replace(/\s/g, '')
          if (!versionDateMap[ver]) versionDateMap[ver] = normalizeDate(lm[2])
        }
        if (Object.keys(versionDateMap).length === 0) {
          const simpleRe = /href="(3\.\d+\.\d+)\//g
          while ((lm = simpleRe.exec(html)) !== null) {
            const ver = lm[1].replace(/\s/g, '')
            if (!versionDateMap[ver]) versionDateMap[ver] = ''
          }
        }
        const sorted = Object.keys(versionDateMap).sort((a, b) => {
          const pa = a.split('.').map(Number)
          const pb = b.split('.').map(Number)
          for (let i = 0; i < 3; i++) {
            if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
          }
          return 0
        }).slice(0, 20)
        const verified: Array<{ version: string; date: string; lts: false; filename: string; downloadUrls: Record<'official' | 'aliyun' | 'huawei' | 'tencent', string> }> = []
        for (const v of sorted) {
          const filename = `python-${v}-amd64.exe`
          const officialUrl = `${mirrors.official}/${v}/${filename}`
          try {
            await axios.head(officialUrl, { timeout: 4000, validateStatus: (s) => s < 400 })
            verified.push({
              version: v,
              date: versionDateMap[v] ?? '',
              lts: false,
              filename,
              downloadUrls: {
                official: officialUrl,
                aliyun: `${mirrors.aliyun}/${v}/${filename}`,
                huawei: `${mirrors.huawei}/${v}/${filename}`,
                tencent: `${mirrors.tencent}/${v}/${filename}`
              }
            })
          } catch {}
          if (verified.length >= 15) break
        }
        log.info(`[python versions] 成功，目录 ${sorted.length} 个，已校验可下载 ${verified.length} 个，来源: ${url}`)
        return verified
      } catch (e: any) {
        log.warn(`[python versions] 失败: ${url} — ${e.message}`)
      }
    }
    return []
  })
}
