import * as core from '@actions/core'
import { OSType, getOs } from './platform.js'
import { AbstractLinks } from './links/links.js'
import { Method } from './method.js'
import { SemVer, coerce } from 'semver'
import { WindowsLinks } from './links/windows-links.js'
import { getLinks } from './links/get-links.js'

// Convert a version string to SemVer. Full semver strings parse exactly; a
// major.minor (or major) pin is padded to .0 and flagged so the caller can
// resolve it to the newest listed patch of the series instead.
function parseVersion(versionString: string): {
  version: SemVer
  pinned: boolean
} {
  try {
    return { version: new SemVer(versionString), pinned: false }
  } catch {
    const coerced = coerce(versionString)
    if (coerced === null) {
      throw new TypeError(`Invalid Version: ${versionString}`)
    }
    return { version: coerced, pinned: true }
  }
}

// Helper for converting string to SemVer and verifying it exists in the links
export async function getVersion(
  versionString: string,
  method: Method
): Promise<SemVer> {
  const { version, pinned } = parseVersion(versionString)
  const links: AbstractLinks = await getLinks()
  let versions
  switch (method) {
    case 'local':
      versions = links.getAvailableLocalCudaVersions()
      break
    case 'network':
      switch (await getOs()) {
        case OSType.linux:
          // TODO adapt this to actual available network versions for linux
          versions = links.getAvailableLocalCudaVersions()
          break
        case OSType.windows:
          versions = (
            links as unknown as WindowsLinks
          ).getAvailableNetworkCudaVersions()
          break
      }
  }
  core.debug(`Available versions: ${versions}`)
  if (pinned) {
    // A major.minor pin floats to the newest listed patch of the same series,
    // matching how apt resolves cuda-nvcc-<major>-<minor> on network installs.
    const newest = versions
      .filter((v) => v.major === version.major && v.minor === version.minor)
      .reduce<
        SemVer | undefined
      >((newest, v) => (newest === undefined || v.compare(newest) > 0 ? v : newest), undefined)
    if (newest !== undefined) {
      core.debug(`Version pin ${version} resolves to: ${newest}`)
      return newest
    }
  } else if (versions.find((v) => v.compare(version) === 0) !== undefined) {
    core.debug(`Version available: ${version}`)
    return version
  }
  core.debug(`Version not available error!`)
  throw new Error(`Version not available: ${version}`)
}
