const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  load: () => ipcRenderer.invoke('notebook:load'),
  save: data => ipcRenderer.invoke('notebook:save', data),
  export: data => ipcRenderer.invoke('notebook:export', data),
  import: () => ipcRenderer.invoke('notebook:import'),
  speak: request => ipcRenderer.invoke('speech:speak', request),
  stopSpeech: () => ipcRenderer.invoke('speech:stop'),
  onFlush: handler => {
    const listener = async () => { const saved = await handler(); ipcRenderer.send('notebook:flushed', saved) }
    ipcRenderer.on('notebook:flush', listener)
    return () => ipcRenderer.removeListener('notebook:flush', listener)
  },
})
