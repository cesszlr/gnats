# GNATS - 现代化的 NATS 管理 GUI

GNATS 是一款专为 [NATS.io](https://nats.io) 设计的现代化、轻量级且功能强大的开源管理界面。它提供了一个直观的 Web UI，帮助开发者和运维人员轻松管理 NATS 集群、监控实时消息、配置 JetStream 以及操作 KV 存储。

![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)
![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8.svg?style=flat&logo=go)
![React Version](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat&logo=react)

---

## ✨ 核心功能

- 🔌 **多连接管理**: 支持保存和切换多个 NATS 服务器连接配置。
- 📊 **实时仪表盘**: 快速查看服务器状态、RTT 延迟及 JetStream 统计信息。
- 🚀 **核心消息 (Pub/Sub)**: 
    - 实时订阅主题并查看进入的消息。
    - 自定义 Payload、Headers 及 Reply-To 地址发布消息。
- 🌊 **JetStream 管理**:
    - 创建、查看、清除和删除 Stream。
    - 实时查看 Stream 中的消息内容（支持 JSON/YAML 格式化）。
    - 监控消费者 (Consumers) 的状态和进度。
- 🔑 **键值存储 (KV Store)**:
    - 管理存储桶 (Buckets)，配置 TTL、历史版本和副本数。
    - 轻松进行 Key 的增删改查。
- 📦 **对象存储 (Object Store)**: 支持存储桶的管理及对象的生命周期操作。
- 🔍 **微服务发现**: 自动发现并展示基于 NATS Micro 框架构建的服务。
- 🌓 **卓越体验**:
    - **深色/浅色模式** 自动切换。
    - **多语言支持**: 完整的中英文界面适配。
    - **响应式设计**: 适配各种屏幕尺寸。

---

## 🛠 技术栈

- **后端**: [Go](https://golang.org/) + [chi](https://github.com/go-chi/chi) (高性能路由) + [nats.go](https://github.com/nats-io/nats.go)
- **前端**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **UI 组件**: [Lucide Icons](https://lucide.dev/) + 原生 CSS 变量 (Modern Theme)
- **国际化**: [i18next](https://www.i18next.com/)
- **部署**: Docker 多阶段构建

---

## 🚀 快速上手

### 使用 Docker (推荐)

这是最快的使用方式，无需安装本地开发环境。

1. **构建镜像**:
   ```bash
   docker build -t gnats-gui .
   ```

2. **启动容器**:
   ```bash
   docker run -d -p 8080:8080 --name gnats-app gnats-gui
   ```

3. **访问**: 打开浏览器访问 `http://localhost:8080`

### 本地开发环境

如果你想进行二次开发或本地运行：

#### 1. 前端准备
```bash
cd ui
npm install
npm run build  # 构建生产环境代码
```

#### 2. 后端运行
在项目根目录下：
```bash
go mod download
go run main.go
```

服务将启动在 `http://localhost:8080`。

---

## 📦 目录结构

```text
.
├── main.go             # 后端入口，负责 API 和静态资源托管
├── internal/
│   ├── handlers/       # API 及 WebSocket 处理逻辑
│   └── nats/           # NATS 连接管理封装
├── ui/                 # React 前端源代码
│   ├── src/
│   │   ├── pages/      # 各功能模块页面
│   │   ├── components/ # 通用组件
│   │   └── i18n.ts     # 国际化配置
│   └── dist/           # 前端构建产物 (由 Vite 生成)
└── Dockerfile          # 多阶段构建文件
```

---

## 📄 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。
