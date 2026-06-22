function plainIpcPayload<T>(value: T): T {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack } as T
  }
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => plainIpcPayload(item)) as T
  const plain: Record<string, any> = {}
  for (const [key, item] of Object.entries(value as Record<string, any>)) {
    if (typeof item !== 'function' && typeof item !== 'symbol') {
      plain[key] = plainIpcPayload(item)
    }
  }
  return plain as T
}

export function sendToRenderer(mainWindow: Electron.BrowserWindow, channel: string, payload: unknown): void {
  mainWindow.webContents.send(channel, plainIpcPayload(payload))
}
