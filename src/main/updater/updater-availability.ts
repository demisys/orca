import { app } from 'electron'

// Personal builds set ORCA_DISABLE_UPDATER=1 so they never offer the upstream release over local patches.
const updaterDisabledAtBuild = typeof ORCA_UPDATER_DISABLED !== 'undefined' && ORCA_UPDATER_DISABLED

export function isUpdaterAvailable(): boolean {
  return app.isPackaged && !updaterDisabledAtBuild
}
