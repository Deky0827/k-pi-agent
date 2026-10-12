# K pi agent

K pi agent runs Pi Web as a Windows desktop application. Electron starts a local Node.js runtime and the upstream `@agegr/pi-web` service, then displays its loopback web interface in a native window. This repository contains the desktop integration; it does not reimplement Pi Web or include your model credentials and conversations.

This is an independent community project and is not an official Pi Web release.

Read the [Chinese project guide](README.zh-CN.md) for architecture, data locations, setup, build commands, and release notes. See [HANDOFF.zh-CN.md](HANDOFF.zh-CN.md) for the current implementation map and known limits, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled components.

The installer currently uses the existing `com.agegr.pidesktop` application identity so it can upgrade earlier K pi agent installations. Windows installers are unsigned by default.
