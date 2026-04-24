# GNATS - 现代化的 NATS 管理 GUI

[English](README.md)

GNATS 是一款专为 [NATS.io](https://nats.io) 设计的现代化、轻量级且功能强大的开源管理界面。它提供了一个直观的 Web UI，帮助开发者和运维人员轻松管理 NATS 集群、监控实时消息、配置 JetStream 以及操作 KV 存储。

![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)
![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8.svg?style=flat&logo=go)
![React Version](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat&logo=react)

---

## ✨ 核心功能

- 🔌 **多连接管理**: 
    - **配置持久化**: 连接信息会自动保存到本地文件，重启不丢失。
    - **快速重连**: 在已保存的多个连接配置间轻松切换。
    - **高级 TLS 支持**: 同时支持证书文件路径和直接粘贴 PEM 内容。
- 📊 **实时仪表盘**: 
    - **动态监控**: 实时展示 API 请求速率趋势图。
    - **统计信息**: 快速查看服务器状态、RTT 延迟及 JetStream 指标。
- 🚀 **核心消息 (Pub/Sub)**: 
    - 实时订阅主题并查看进入的消息。
    - 自定义 Payload、Headers 及 Reply-To 地址发布消息。
- 🌊 **JetStream 管理**:
    - **负载可视化**: 通过图表直观展示 Top 10 Stream 的消息分布。
    - 创建、查看、清除和删除 Stream。
    - 实时查看 Stream 中的消息内容（支持 JSON/YAML 格式化）。
    - 监控消费者 (Consumers) 的状态和进度。
- 🔑 **键值存储 (KV Store)**:
    - 管理存储桶 (Buckets)，配置 TTL、历史版本和副本数。
    - 轻松进行 Key 的增删改查。
- 📦 **对象存储 (Object Store)**: 支持存储桶的管理及对象的生命周期操作。
- 🔍 **微服务发现**: 自动发现并展示基于 NATS Micro 框架构建的服务。
- 📦 **单文件分发**: 前端产物直接嵌入 Go 二进制文件，实现无依赖部署。
- 🌓 **卓越体验**:
    - **深色/浅色模式** 自动切换。
    - **多语言支持**: 完整的中英文界面适配。
    - **响应式设计**: 适配各种屏幕尺寸。

---

## 📸 界面截图

### 仪表盘 (Dashboard)
![Dashboard](images/dashborad.png)

### 连接管理 (Connections)
![Connections](images/connections.png)

### 核心消息 (Pub/Sub)
![Publish/Subscribe](images/pub.png)

### 键值存储 (KV Store)
![KV Store](images/kv.png)

---

## ⚙️ 配置项

GNATS 支持通过环境变量进行配置：

| 环境变量 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `PORT` | Web UI 监听的端口。 | `8080` |
| `CONNECTIONS_FILE` | 连接配置文件的保存/加载路径。 | `connections.json` |
| `DEBUG` | 设置为 `true` 时，将实时读取 `ui/dist` 文件夹而非嵌入文件。 | `false` |

---

## 🗺️ 开发计划 (Roadmap)

### 3. 开发利器 (Developer Experience)
- **消息模板 (Snippets)**：保存并快速复用常用的消息 Payload。
- **Schema 校验**：集成 JSON Schema 校验，确保发布内容符合规范。
- **消息重放 (Replay)**：一键将 Stream 中的历史消息重新发布。

### 4. 高级对象管理 (Advanced Management)
- **动态编辑 Stream**：无需删除即可修改 Stream 配置（如增加主题、调整限额）。
- **批量操作**：支持批量清空 Stream 或批量删除 KV 键值对。
- **导入/导出**：快速备份或迁移所有连接配置。

### 5. 交互细节 (Polish)
- **键盘快捷键**：`Ctrl+Enter` 快速发布，`/` 键快速聚焦搜索框。
- **全局搜索增强**：支持在 Stream 历史消息内容中进行全文检索。

---

## 🚀 快速上手

### 使用 Docker (推荐)

这是最快的使用方式。由于采用了单文件嵌入，镜像体积极小。

1. **拉取镜像**:
   ```bash
   docker pull cesszlr/gnats:latest
   ```

2. **启动容器**:
   ```bash
   docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e CONNECTIONS_FILE=/app/data/connections.json --name gnats-app cesszlr/gnats:latest
   ```

3. **访问**: 打开浏览器访问 `http://localhost:8080`

### 使用 Docker 本地构建

1. **构建镜像**:
   ```bash
   docker build -t gnats-gui .
   ```

2. **启动容器**:
   ```bash
   docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e CONNECTIONS_FILE=/app/data/connections.json --name gnats-app gnats-gui
   ```

---

## 🛠 技术栈

- **后端**: [Go](https://golang.org/) + [chi](https://github.com/go-chi/chi) (高性能路由) + [nats.go](https://github.com/nats-io/nats.go)
- **前端**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **UI 组件**: [Lucide Icons](https://lucide.dev/) + [Recharts](https://recharts.org/) + 原生 CSS 变量
- **国际化**: [i18next](https://www.i18next.com/)
- **部署**: `go:embed` + Docker 多阶段构建

---

## 📄 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。
