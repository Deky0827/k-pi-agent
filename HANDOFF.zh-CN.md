# K pi agent development handoff

## Architecture

K pi agent runs the upstream Pi Web interface in an Electron desktop window. Electron starts the bundled Node.js runtime and local Pi Web service, while the desktop layer manages service lifecycle, tray, settings, updates, appearance, and the optional pet.

Application settings and runtime payloads live under the app's user data directory. Pi Agent authentication, model configuration, and conversations remain in the user's Pi data directory. Keep both locations out of source archives, issue attachments, and commits.

## Current implementation

- The app waits for its Pi Web service to stop during normal shutdown and can cancel startup.
- Runtime updates are staged, checked, committed through version pointers, and recoverable after interruption.
- Resource archives and imported settings are validated before replacing existing data.
- Saved theme mode is applied on startup; previous injected CSS is removed before new CSS is applied.
- Pet session scanning follows `PI_CODING_AGENT_DIR`, stops when the pet is disabled, and polls every ten seconds while enabled.
- NSIS attempts Windows NTFS XPRESS16K compression on the bundled offline seed after installation.

## Build and test

See `README.md` and `README.zh-CN.md`. The first build requires Windows x64, Node.js 22.19 or newer, npm 11, and network access to npm and the official Node/Electron distribution endpoints. Pi Web production dependencies are locked under `payload/pi-web/`.

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run prepare:payload`, `npm run smoke:payload`, and `npm run dist:installer` before preparing a release.

## Known limits

- The Windows installer is unsigned by default.
- Clean-machine install, upgrade, and uninstall behavior should be verified before calling a release stable.
- Pet activity is inferred from the newest Pi session file and can be misattributed when multiple projects run at once.
- The installer is larger than the previous 2.6.0 build; the increase still needs analysis.
- The app preserves the existing `com.agegr.pidesktop` identity for upgrade compatibility.
