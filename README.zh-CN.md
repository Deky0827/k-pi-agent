# K pi agent 2.6.2

K pi agent 是 Pi Web 的 Windows 桌面外壳：Electron 启动内置 Node 与原版 `@agegr/pi-web` 本地服务，再将 `127.0.0.1` 页面显示在桌面窗口中。它不重写 Pi Web，也不包含用户的模型密钥或会话。

这是独立的社区桌面项目，不代表 Pi Web 官方发行版。

## 数据与离线运行

- 应用设置、日志和可更新 payload 位于 `%APPDATA%\pi-desktop`。
- Pi Agent 的认证、模型配置与会话仍由 Pi 管理，默认位于 `%USERPROFILE%\.pi\agent`；如使用 `PI_CODING_AGENT_DIR`，桌宠状态扫描会跟随该目录。
- 安装包内置 Pi Web 0.11.0 与 Node 22.23.3 的离线种子。首次启动将种子复制到应用数据目录，随后从该目录运行；升级失败可回退旧 payload。
- NSIS 安装成功后会尝试对只读 seed 目录启用 Windows NTFS XPRESS16K 压缩。压缩失败不会影响安装或运行；便携版不执行此步骤。

## 2.6.2 改动

- 退出时等待 Pi Web 服务树停止；启动阶段可取消；服务意外退出后可从界面恢复。
- Node 与 Pi Web 更新先暂存并分别做健康检查，再事务提交版本指针；失败回滚，启动时恢复未完成事务。
- 桌宠/主题 ZIP 限制路径、体积和文件数，验证资源清单后再替换；设置输入校验字段和范围，损坏设置先备份。
- 启动时同步已保存的 system/light/dark 模式；应用新 CSS 前移除上一版，避免重复累积。
- 桌宠禁用时停止会话扫描；启用时将全量扫描间隔调为 10 秒。10,000 个合成会话文件的单次扫描为 445 ms；这是本机合成测量，不代表其他磁盘性能。
- 发布前安全审计发现 ZIP 处理库存在公告漏洞；本版本升级到 adm-zip 0.6.1，并将 Electron 升级到 44.7.0。

## 开发与构建

需要 Windows x64、Git、Node.js 22.19 或更高版本、npm 11 和网络连接。干净环境第一次构建会从 npm registry 与 nodejs.org 获取 Pi Web、Node 和 Electron 官方构建文件；Pi Web 与其间接依赖锁定在 `payload/pi-web/package-lock.json`。准备好的 payload 与构建缓存不会提交到仓库。

```powershell
npm ci
npm run typecheck
npm test
npm run smoke:payload
npm run dist:all
```

`npm run prepare:payload` 会复用匹配的 seed；升级 Pi Web 时请同时更新 `payload/pi-web/package.json` 和锁文件，再完成烟测。Node 版本在 `scripts/prepare-payload.mjs` 中固定，下载后会对照 Node 官方校验和。electron-builder 会在首次打包时从官方分发端点获取锁定版本的 Electron。

隔离运行可通过 `K_AGENT_DATA_DIR`、`K_AGENT_PORT` 和 `PI_CODING_AGENT_DIR` 指定独立应用数据、端口与 Pi Agent 数据目录。正式测试不要指向用户现有的 `.pi\agent`。

## 发行边界

`release\` 保存本机生成的发行物，默认不纳入源码版本控制。安装器需要独立完成干净 Windows profile 安装、升级与卸载验收；当前安装器未签名。不要将 `%APPDATA%\pi-desktop`、`%USERPROFILE%\.pi\agent`、`.env`、`auth.json`、`models.json` 或其他用户凭据打入交付包。
