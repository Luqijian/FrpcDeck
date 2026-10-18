<p align="center">
  <img src="web/public/favicon.svg" width="76" alt="FrpcDeck logo" />
</p>

<h1 align="center">FrpcDeck</h1>

<p align="center">
  为 <a href="https://github.com/fatedier/frp">frpc</a> 打造的可视化配置与运行管理面板<br/>
  全量配置 · 实时状态 · 日志跟随 · 移动端适配 · 与 frpc 同容器部署
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/Luqijian/FrpcDeck/actions/workflows/ci.yml"><img src="https://github.com/Luqijian/FrpcDeck/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Luqijian/FrpcDeck/tags"><img src="https://img.shields.io/github/v/tag/Luqijian/FrpcDeck?display_name=tag" alt="Latest tag" /></a>
  <a href="https://github.com/Luqijian/FrpcDeck/pkgs/container/frpcdeck"><img src="https://img.shields.io/badge/GHCR-ghcr.io%2Fluqijian%2Ffrpcdeck-2496ED?logo=github&logoColor=white" alt="GHCR image" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/frpc-0.71.1-38d9a9" alt="frp 0.71.1" />
</p>

![FrpcDeck 概览](docs/screenshots/dashboard.png)

## 简介

FrpcDeck 不是 frps 服务端面板。它管理运行在内网一侧的 **frpc**：用表单编写配置、用 frpc 原生能力校验、启动/重启进程、查看每个代理的实时状态与日志。

一个镜像同时包含 Web 面板、Node 服务和 frpc。你不需要在宿主机安装 Node，也不需要手工维护 `frpc.toml`。

## 核心特性

- **覆盖 frpc 客户端主要配置**：服务端连接、Token / OIDC、传输、TLS、QUIC、日志、管理接口、元数据，以及全部代理类型与 10 种插件。
- **批量端口**：兼容 `parseNumberRangePair` 端口范围写法；导入、新建、编辑和导出都在同一套结构化界面中完成，列表中一个批次只占一条代理。
- **原生校验**：应用前执行 `frpc verify`，避免把无法启动的配置写入运行文件。
- **实时状态**：读取 frpc 管理接口，展示连接、代理状态、PID、版本、运行时长和实际远程端口。
- **实时日志**：SSE 日志流、级别过滤、搜索、暂停、复制、下载；支持跟随文件日志。
- **移动端友好**：抽屉表单、底部导航和悬浮保存栏，手机也能完成全部配置。
- **安全**：scrypt 密码哈希、签名 HttpOnly Cookie、登录限流、CSRF 校验、CSP、敏感文件 0600。
- **备份与迁移**：每次应用前自动备份；支持 TOML / YAML / JSON / INI 导入，保留未知字段。
- **部署简单**：多阶段 Docker 构建，内置 frpc；支持 amd64 / arm64 / arm。

### 更多界面

| 代理管理 | 代理编辑器 |
| --- | --- |
| ![代理](docs/screenshots/proxies.png) | ![编辑器](docs/screenshots/editor.png) |

| 运行日志 | 移动端 |
| --- | --- |
| ![日志](docs/screenshots/logs.png) | <img src="docs/screenshots/mobile-proxies.png" width="290" alt="移动端" /> |

## 快速开始

公开镜像：**`ghcr.io/luqijian/frpcdeck:latest`**（linux/amd64、linux/arm64）

需要 Docker 24+ 与 Docker Compose v2。使用预构建镜像不需要 Node、pnpm 或 frp 构建环境。

```bash
# 可选：先拉取镜像
docker pull ghcr.io/luqijian/frpcdeck:latest

git clone https://github.com/Luqijian/FrpcDeck.git
cd FrpcDeck

# 可选：复制 .env 修改端口、时区等
cp .env.example .env

docker compose pull
docker compose up -d

# 首次启动会在日志中生成随机管理员密码
docker compose logs frpcdeck | grep 初始密码
```

打开 `http://<服务器IP>:8080`，使用 `admin` 和日志中的初始密码登录。首次登录会被强制修改用户名与密码。

> Linux 上如果 frpc 需要访问宿主机的 `127.0.0.1` 服务，推荐使用 host 网络：
>
> ```bash
> docker compose -f compose.host.yaml pull
> docker compose -f compose.host.yaml up -d
> ```

从源码构建（开发或需要自定义 frp 版本时）：

```bash
docker compose up -d --build
```

固定版本可设置 `IMAGE_TAG=2.0.2`。更多镜像与部署说明见[部署指南](docs/deployment.md)。

首次使用：

1. **连接配置**：填写 frps 地址、端口、token 或 OIDC；
2. **代理**：新建 TCP / HTTP / STCP 等代理；
3. **应用更改**：面板校验、写入 `frpc.toml` 并启动 frpc。

已有配置可以在「连接配置 → 导入配置」中导入；也可以在首次启动前把 `frpc.toml` 放进 `./data`，面板会自动接管并创建备份。

## 文档

| 文档 | 内容 |
| --- | --- |
| [部署指南](docs/deployment.md) | GHCR 公开镜像、Compose、host 网络、环境变量、反向代理、升级、备份 |
| [配置说明](docs/configuration.md) | 字段覆盖范围、代理/插件/访问器、批量端口、导入、校验 |
| [架构设计](docs/architecture.md) | 模块、数据流、进程状态、安全模型 |
| [HTTP API](docs/api.md) | REST 接口、SSE、认证、错误格式 |
| [本地开发](docs/development.md) | 开发环境、测试、新增字段、发布流程 |
| [故障排查](docs/troubleshooting.md) | Docker、frpc、登录、日志、网络问题 |

完整文档索引见 [docs/README.md](docs/README.md)。

## 兼容性

- 默认内置 **frpc 0.71.1**，界面按 frp 0.71.x 的字段实现。
- frpc 与 frps 建议保持一致；通过 `FRP_VERSION` 构建参数可以换成与 frps 匹配的版本。
- 官方 `frpc_full_example.toml` 已纳入解析/生成往返测试，并通过 `frpc verify`。
- 未在表单中覆盖的字段，可以通过 TOML 导入保留和使用。

## 安全

FrpcDeck 拥有 frpc 的完整控制权，请像保护 SSH 一样保护它：

- 首次启动密码只打印在容器日志中，登录后立即修改并定期轮换；密码不会写入 `frpc.toml`；
- 限制 8080 端口的访问来源；
- 公网访问必须使用 HTTPS 反向代理，并设置 `COOKIE_SECURE=true`、`TRUST_PROXY=true`；
- 不要提交或分享 `data/` 目录（含 token、secretKey、证书路径和密码哈希）；
- frpc 管理接口默认仅监听 `127.0.0.1`，不要直接暴露。

漏洞报告请阅读 [SECURITY.md](SECURITY.md)。

## 开发与测试

```bash
pnpm install
pnpm dev      # 前端 5173，后端 8080
pnpm test     # 配置、存储、API 集成测试
pnpm build    # 构建前端
```

浏览器冒烟测试：

```bash
E2E_BASE_URL=http://127.0.0.1:8080 E2E_PASSWORD=your-password pnpm test:e2e
```

详细说明见 [docs/development.md](docs/development.md)。

## 贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)

如果 FrpcDeck 对你有帮助，欢迎点一个 Star ⭐，或分享给需要管理 frp 的朋友。

## 许可证

[MIT](LICENSE) © 2026 Luqijian

镜像内下载的 frp 及测试 fixture 遵循其上游许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
