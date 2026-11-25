import { ipcMain } from 'electron'

export type RendererFocusFlagMirror = {
  get: () => boolean
  reset: () => void
  dispose: () => void
}

/** Mirror a renderer-reported focus flag; check sender and strict boolean so guests/malformed payloads can't set it. */
export function mirrorRendererFocusFlag(
  channel: string,
  rendererWebContents: Electron.WebContents
): RendererFocusFlagMirror {
  let value = false
  const onChange = (event: Electron.IpcMainEvent, focused: unknown): void => {
    if (event.sender === rendererWebContents) {
      value = focused === true
    }
  }
  ipcMain.on(channel, onChange)
  return {
    get: () => value,
    reset: () => {
      value = false
    },
    dispose: () => {
      value = false
      ipcMain.removeListener(channel, onChange)
    }
  }
}
