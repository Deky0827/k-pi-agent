# K pi agent

[中文主页](README.md) · [Windows preview download](https://github.com/Deky0827/k-pi-agent/releases/tag/v2.6.2) · [Upstream Pi Web](https://github.com/agegr/pi-web)

**A personal desktop assistant for research, learning and everyday work.** Built for graduate students and other users without a programming background, K pi agent aims to help people build their own Agent App around their models, files and local sessions.

K pi agent packages Pi Web as a Windows desktop application, with a bundled Node.js runtime, a desktop window, tray integration, service lifecycle management and appearance settings. The agent interface and session capabilities come from upstream Pi Web.

## Why this project exists

As a beginner without a programming background, I wanted a personal computer assistant for graduate students and other non-programmers: one place to help with information research, literature access, data analysis, presentations and computer troubleshooting. Pi Web provided a foundation for this idea, but setup and local service management still took some learning. This desktop wrapper reduces that friction: install it, open it like a regular application, and configure your own model provider.

These scenarios are development goals, not a claim that every dedicated tool or workflow is already built in and validated. Actual task capabilities depend on the configured model, tools, skills and permissions. For computer repairs, an important goal is to explain system changes and support confirmation and recovery for consequential operations.

This is an independent community project, not an official Pi Web distribution. The current release is the **2.6.2 public preview**. The installer includes the runtime; you still need your own model provider credentials or supported provider login. Online model calls require a network connection and may incur provider charges.

> If this application helps you, please also **[star upstream Pi Web](https://github.com/agegr/pi-web)** and support its author and contributors.

## App homepage

![K pi agent Windows desktop homepage](docs/images/app-home.png)

Actual application screenshot supplied by the author. Models and projects shown are personal configuration examples, not bundled defaults. Updated runtime components may differ from the installer seed.

## Development and limitations

See the [Chinese technical guide](README.zh-CN.md) for architecture, data locations and build commands. The [handoff guide](HANDOFF.zh-CN.md) maps the implementation, and [release notes](RELEASE_NOTES.md) describe current limitations.

Windows installers are unsigned. Clean-machine installation, upgrade, uninstall and desktop UI validation still need further testing. Runtime component updates do not update the desktop installer itself.

The installer retains application identity `com.agegr.pidesktop` for the current upgrade path. It does not bundle personal credentials or conversations. Model requests are sent to the provider you configure.

## License and upstream

The desktop integration uses the [MIT License](LICENSE). This project builds on [Pi Web](https://github.com/agegr/pi-web); its copyright and license remain with its author. See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled components and licenses.
