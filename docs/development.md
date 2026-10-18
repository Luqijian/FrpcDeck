# 本地开发

## 环境

- Node.js `^20.19` 或 `>=22.12`（推荐 22 LTS）
- pnpm 11
- 可选：本机 frpc 可执行文件，用于启动和原生校验
- 可选：Chrome / Chromium，用于浏览器冒烟测试

```bash
node -v
pnpm -v
```

## 启动开发环境

```bash
pnpm install

# 可选：让面板使用本地 frpc
# Linux/macOS
FRPC_BIN=/path/to/frpc pnpm dev
# Windows PowerShell
$env:FRPC_BIN="E:\tools\frp\frpc.exe"; pnpm dev
```

启动后：

- 前端：http://localhost:5173
- 后端：http://localhost:8080
- Vite 会把 `/api` 代理到后端；SSE 同样通过代理

默认数据目录是项目下的 `data/`（已忽略）。如果 `.env` 中设置了 `FRPC_WEBUI_PASSWORD`，密码由环境变量托管；否则首次打开会进入初始化向导。

单独运行：

```bash
pnpm dev:server   # 后端 watch
pnpm dev:web      # Vite
```

生产构建：

```bash
pnpm build
PORT=8080 DATA_DIR=./data FRPC_BIN=/path/to/frpc pnpm start
```

## 目录结构

```text
server/                 Fastify 后端
├─ index.js             启动、静态资源、安全头、优雅退出
├─ routes.js            REST / SSE / 备份 / 认证
├─ frpc.js              frpc 子进程、状态轮询、日志跟随
├─ config.js            默认值、校验、导入、TOML 生成
├─ toml.js              TOML 序列化
├─ store.js             数据目录、备份、原子写入
└─ auth.js              scrypt、会话 Cookie

shared/constants.js     前后端共享枚举

web/
├─ src/pages/           概览、代理、访问器、连接、日志、设置
├─ src/components/      设计系统与业务组件
├─ src/styles/          变量、组件、页面、响应式样式
└─ public/              favicon 等静态资源

tests/                  node:test + Playwright 冒烟
docs/                   用户与开发者文档
scripts/dev.js          同时启动前后端
```

## 测试

```bash
pnpm test
```

包含：

- 配置生成、官方完整示例往返、导入、校验；
- 数据目录首次导入、损坏恢复、备份；
- API 集成测试（会启动临时 Node 服务与临时数据目录，不依赖真实 frpc）。

浏览器冒烟测试需要先启动一个实例：

```bash
E2E_BASE_URL=http://127.0.0.1:8080 \
E2E_USERNAME=admin \
E2E_PASSWORD=your-password \
pnpm test:e2e
```

Windows PowerShell：

```powershell
$env:E2E_BASE_URL="http://127.0.0.1:8080"
$env:E2E_PASSWORD="your-password"
pnpm test:e2e
```

如果 Chrome 不在默认位置，设置 `E2E_CHROME` 指向可执行文件。

## 如何新增 frpc 字段

1. **枚举/类型**：如需新增代理或插件类型，更新 `shared/constants.js`。
2. **后端模型**：在 `server/config.js` 的归一化、`compactConfig` 和 `generateToml` 流程中处理字段。
3. **校验**：在 `validateConfig` 中增加错误/警告。
4. **前端元数据**：在 `web/src/frp.js` 中补默认值和展示逻辑。
5. **表单**：在 `web/src/components/ProxyEditor.vue`、`VisitorEditor.vue` 或 `ConnectionPage.vue` 中添加字段。
6. **测试**：在 `tests/config.test.js` 中加往返/校验用例；必要时更新官方示例 fixture。

导入时未知字段会自动保留，所以新字段即使还没加表单，用户仍可通过 TOML 使用。

## 代码约定

- 后端使用 ESM，不引入 ORM；配置写入必须原子化。
- 前端使用 Vue 3 `<script setup>`，不引入 UI 框架；优先复用现有设计系统组件。
- 新增用户可见文案使用中文；代码标识符、注释和提交信息用英文。
- 表单必须有 label，移动端必须保持 320px 宽度可用。
- 涉及密钥、令牌、密码的值不得写入日志或错误响应。
- 修改安全相关逻辑时请补充测试。

## 提交前检查

```bash
pnpm test
pnpm build
```

并确认：

- `git status` 中没有 `.env`、`data/`、`.tools/`、`node_modules/`；
- 没有提交真实 token/密码；
- 文档中的截图和链接仍然有效。

## Docker 构建

```bash
docker compose build
# 或
docker build -t frpcdeck:dev .
```

受限制的 Docker 环境（如 OpenWrt/iStoreOS）如果构建阶段不能解析 DNS，使用：

```bash
DOCKER_BUILDKIT=0 docker build --network host -t frpcdeck:dev .
```

## 发布流程

1. 更新 `package.json` 版本与 `CHANGELOG.md`；
2. 运行完整测试与浏览器冒烟；
3. 构建 Docker 镜像并做一次全新数据目录启动；
4. 提交 `chore(release): vX.Y.Z`；
5. 推送到 `main`，创建并推送 `vX.Y.Z` 标签；
6. 在 GitHub Releases 中粘贴 CHANGELOG 摘要，附上镜像构建说明。

## 贡献

请阅读 [CONTRIBUTING](../CONTRIBUTING.md) 和 [CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md)。安全问题请按 [SECURITY](../SECURITY.md) 私下报告。
