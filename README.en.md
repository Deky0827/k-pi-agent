# K pi agent

[中文主页](README.md) · [Windows preview download](https://github.com/Deky0827/pi-web-agent-app/releases/tag/v2.6.2) · [Upstream Pi Web](https://github.com/agegr/pi-web)

K pi agent packages Pi Web as a Windows desktop application, with a bundled Node.js runtime, a desktop window, tray integration, service lifecycle management and appearance settings. The agent interface and session capabilities come from upstream Pi Web.

## Why this project exists

As a beginner without a programming background, I enjoyed using Pi Web but found the initial environment setup and day-to-day management of a local service took some learning. This wrapper aims to reduce that friction: install it, open it like a regular application, and configure your own model provider through the interface.

This is an independent community project, not an official Pi Web distribution. The current release is the **2.6.2 public preview**. The installer includes the runtime; you still need your own model provider credentials or supported provider login. Online model calls require a network connection and may incur provider charges.

> If this application helps you, please also **[star upstream Pi Web](https://github.com/agegr/pi-web)** and support its author and contributors.

## Development and limitations

See the [Chinese technical guide](README.zh-CN.md) for architecture, data locations and build commands. The [handoff guide](HANDOFF.zh-CN.md) maps the implementation, and [release notes](RELEASE_NOTES.md) describe current limitations.

Windows installers are unsigned. Clean-machine installation, upgrade, uninstall and desktop UI validation still need further testing. Runtime component updates do not update the desktop installer itself.

The installer retains application identity `com.agegr.pidesktop` for the current upgrade path. It does not bundle personal credentials or conversations. Model requests are sent to the provider you configure.

## License and upstream

The desktop integration uses the [MIT License](LICENSE). This project builds on [Pi Web](https://github.com/agegr/pi-web); its copyright and license remain with its author. See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled components and licenses.
