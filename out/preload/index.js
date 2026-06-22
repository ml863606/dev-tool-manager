"use strict";
const electron = require("electron");
function toPlain(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => toPlain(item));
  const plain = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "function" && typeof item !== "symbol") {
      plain[key] = toPlain(item);
    }
  }
  return plain;
}
const api = {
  tools: {
    list: () => electron.ipcRenderer.invoke("tools:list"),
    autoDetect: () => electron.ipcRenderer.invoke("tools:autoDetect"),
    clearCache: () => electron.ipcRenderer.invoke("tools:clearCache"),
    onDetectProgress: (cb) => {
      electron.ipcRenderer.on("tools:detectProgress", (_e, data) => cb(data));
      return () => electron.ipcRenderer.removeAllListeners("tools:detectProgress");
    },
    verify: (toolId) => electron.ipcRenderer.invoke("tool:verify", toolId),
    openDir: (dirPath) => electron.ipcRenderer.invoke("tool:openDir", dirPath),
    unmark: (toolId) => electron.ipcRenderer.invoke("tool:unmark", toolId)
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    save: (settings) => electron.ipcRenderer.invoke("settings:save", settings)
  },
  taskCache: {
    get: () => electron.ipcRenderer.invoke("taskCache:get"),
    save: (payload) => electron.ipcRenderer.invoke("taskCache:save", payload)
  },
  network: {
    detect: () => electron.ipcRenderer.invoke("network:detect"),
    probeAll: () => electron.ipcRenderer.invoke("network:probeAll"),
    checkPort: (port) => electron.ipcRenderer.invoke("network:checkPort", port),
    listPorts: () => electron.ipcRenderer.invoke("network:listPorts")
  },
  python: {
    fetchVersions: () => electron.ipcRenderer.invoke("python:fetchVersions")
  },
  jdk: {
    fetchVersions: (vendorId) => electron.ipcRenderer.invoke("jdk:fetchVersions", vendorId),
    fetchVendors: () => electron.ipcRenderer.invoke("jdk:fetchVendors")
  },
  nodejs: {
    fetchVersions: () => electron.ipcRenderer.invoke("nodejs:fetchVersions")
  },
  maven: {
    fetchVersions: () => electron.ipcRenderer.invoke("maven:fetchVersions"),
    installLocal: (payload) => electron.ipcRenderer.invoke("maven:installLocal", payload)
  },
  mysql: {
    fetchVersions: () => electron.ipcRenderer.invoke("mysql:fetchVersions"),
    installLocal: (payload) => electron.ipcRenderer.invoke("mysql:installLocal", payload)
  },
  redis: {
    installLocal: (payload) => electron.ipcRenderer.invoke("redis:installLocal", payload)
  },
  git: {
    fetchVersions: () => electron.ipcRenderer.invoke("git:fetchVersions")
  },
  codex: {
    fetchVersions: () => electron.ipcRenderer.invoke("codex:fetchVersions")
  },
  claudeCode: {
    fetchVersions: () => electron.ipcRenderer.invoke("claudeCode:fetchVersions")
  },
  npmRegistry: {
    get: () => electron.ipcRenderer.invoke("npmRegistry:get"),
    list: () => electron.ipcRenderer.invoke("npmRegistry:list"),
    set: (url) => electron.ipcRenderer.invoke("npmRegistry:set", url)
  },
  download: {
    start: (payload) => electron.ipcRenderer.invoke("download:start", toPlain(payload)),
    pause: (taskId) => electron.ipcRenderer.invoke("download:pause", taskId),
    findCached: (filename) => electron.ipcRenderer.invoke("download:findCached", filename),
    openFile: (filePath) => electron.ipcRenderer.invoke("download:openFile", filePath),
    openDirOfFile: (filePath) => electron.ipcRenderer.invoke("download:openDirOfFile", filePath),
    onProgress: (cb) => {
      electron.ipcRenderer.on("download:progress", (_e, task) => {
        void cb(toPlain(task));
      });
      return () => electron.ipcRenderer.removeAllListeners("download:progress");
    },
    onInstallStatus: (cb) => {
      electron.ipcRenderer.on("install:status", (_e, data) => {
        void cb(toPlain(data));
      });
      return () => electron.ipcRenderer.removeAllListeners("install:status");
    },
    onInstallComplete: (cb) => {
      electron.ipcRenderer.on("install:complete", (_e, data) => {
        void cb(toPlain(data));
      });
      return () => electron.ipcRenderer.removeAllListeners("install:complete");
    }
  },
  dialog: {
    selectDir: (defaultPath) => electron.ipcRenderer.invoke("dialog:selectDir", defaultPath)
  },
  log: (level, ...args) => electron.ipcRenderer.send("renderer:log", level, ...args)
};
electron.contextBridge.exposeInMainWorld("api", api);
