# K pi agent 2.6.2

This is the first public preview of the Windows desktop app built around the upstream Pi Web interface.

## Highlights

- Waits for the local Pi Web service to stop when the desktop app exits and offers recovery after an unexpected service exit.
- Stages Pi Web and Node updates, checks the candidate service, and restores version pointers after an interrupted update.
- Validates resource archives and settings before replacing existing data.
- Applies the saved theme on startup and avoids accumulating injected CSS.
- Stops pet session scanning while the pet is disabled and scans at a lower interval while enabled.
- Keeps an offline Pi Web and Node seed in the installer; NSIS attempts NTFS compression after installation.
- Updates the ZIP parser to adm-zip 0.6.1 and Electron to 44.7.0 after release security review.

## Known limits

- The Windows installer is unsigned and may show an unknown publisher warning.
- Clean-machine install, upgrade, and uninstall behavior still needs broader testing.
- The installed runtime dependency audits report no known vulnerabilities; npm reports 8 moderate advisories in development/build tooling, with no high or critical findings.
- Pet activity is inferred from the newest Pi session file and can be misattributed when several projects run at once.
- The installer is larger than the previous 2.6.0 build; the increase has not yet been fully explained.

This preview keeps the existing application identity `com.agegr.pidesktop` to preserve the current upgrade path.
