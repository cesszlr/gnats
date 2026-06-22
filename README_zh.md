# GNATS - 现代化的 NATS 管理 GUI

[English](README.md)

GNATS 是一款专为 [NATS.io](https://nats.io) 设计的现代化、轻量级且功能强大的开源管理界面。它提供了一个直观的 Web UI，帮助开发者和运维人员轻松管理 NATS 集群、监控实时消息、配置 JetStream 以及操作 KV 存储。

![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)
![Go Version](https://img.shields.io/badge/Go-1.26-00ADD8.svg?style=flat&logo=go)
![React Version](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat&logo=react)

---

## ✨ 核心功能

- 🔌 **多连接管理**: 
    - **单活跃连接**: 智能切换系统，在切换环境时自动清理后台资源。
    - **连接编辑**: 通过统一的模态框（Modal）界面随时调整已有配置。
    - **高级 TLS 支持**: 同时支持证书文件路径和直接粘贴 PEM 内容。
- 📊 **账号级全局监控**: 
    - **NATS 监控集成**: 直接集成 NATS `/accstatz` 和 `/connz` 端点以获取最精准的业务指标。
    - **多账号切换**: 无缝切换不同的 NATS 账号以监控隔离的流量。
    - **活跃客户端追踪**: 监控高负载 Top 10 客户端，支持服务端排序（按待发送字节、发送/接收消息数）。
    - **实时统计**: 准确的吞吐量图表 (msgs/s) 和高保真滚动动画。
- 🚀 **核心消息 (Pub/Sub & Request-Reply)**: 
    - 实时订阅主题并查看进入的消息。
    - 展示消息高级数据（系统随机生成的或自定义的 `Reply-To` 收件箱、NATS 消息头以标签展示）。
    - 自定义 Payload、Headers 及 Reply-To 地址发布消息。
    - **Request-Reply（请求-响应）调试面板**：提供专用界面，支持发送请求并同步等待、自定义回复主题（Reply-To）并设置超时时间。
    - **取消请求**：支持前端一键取消挂起的请求（基于 `AbortController` 物理断连），后端实时感知并回收临时订阅和协程资源。
    - **高级订阅配置**：支持可视化配置队列组（Queue Group）、最大消息数（Auto Unsubscribe 自动退订）和慢消费者积压上限（Pending Limit）。
- 🌊 **JetStream 管理**:
    - **负载可视化**: 通过图表直观展示 Top Streams 的消息分布。
    - 创建、查看、清除和删除 Stream，**清空操作支持美观的应用内确认弹窗**。
    - **元数据与描述透视**：在流的详细配置和实时状态弹窗中，优雅展示流的 Description 及自定义 Metadata 键值，消费者详情中亦支持展示绑定的 Metadata。
    - **SSE 实时消息捕获**: 支持基于 SSE (Server-Sent Events) 的流式实时消息捕获与零延迟秒开弹窗。提供捕获开始/停止一键开关、增量去重、最大 200 条保留上限和状态呼吸灯动效（支持 JSON/YAML 格式化）。
    - **消费者 (Consumer) 全生命周期管理**: 图形化创建 Push/Pull 消费者（支持 Durable Name、描述、确认/投递策略、确认等待时间、最大投递数、逗号分隔多过滤主题），采用表格行列表清爽展示核心指标（Pending, Ack Pending, 重发次数），支持一键删除以及提供防溢出的完备详情弹窗。
- 🔑 **键值存储 (KV Store)**:
    - 管理存储桶 (Buckets)，配置 TTL、历史版本和副本数。
    - **Bucket 元数据展示**: 若 Bucket 配置了自定义元数据，状态栏中支持常驻卡片化展示。
    - **专业编辑器**: 集成 **CodeMirror 6**，提供高性能的值编辑体验。
    - **智能格式化**: 支持 JSON/YAML 的实时语法高亮、自动缩进和代码折叠。
    - 轻松进行 Key 的增删改查。
- 📦 **对象存储 (Object Store)**:
    - 支持存储桶的管理及对象的生命周期操作，同 KV 存储一样**支持 Bucket 级 Metadata 常驻展示**。
    - **对象详情深度查阅**: 在对象详情页中，提供折叠面板展示 NUID、分块数 (Chunks)、Hash 校验值 (Digest)、Description 以及自定义元数据 (Metadata) 详细属性。
- 🔍 **微服务发现**:
    - 自动发现并展示基于 NATS Micro 框架构建的服务。
    - **增强型元数据展示**: 在服务卡片直接常驻展示所属的自定义 Metadata 属性。
    - **双细节折叠面板**: 点击按钮异步请求 `$SRV.INFO` 和 `$SRV.STATS`，动态展示服务的端点信息（Endpoints）、端点级元数据、详细描述（Description）以及启动时间、平均延迟、累计请求数、报错次数和最近的错误信息，并配备有平滑的 Hover Tooltip 悬浮提示。
- 📦 **单文件分发**: 前端产物直接嵌入 Go 二进制文件，实现无依赖部署。
- 🌓 **卓越体验**:
    - **深色/浅色模式** 自动切换。
    - **多语言支持**: 完善的中英文界面本地化。
    - **丰富的详情与浮窗**: 包含网络延迟 (RTT) 和吞吐量分析的详细连接信息。
    - **响应式设计**: 适配各种屏幕尺寸。

---

## 📸 界面截图

### 仪表盘 (Dashboard)
![Dashboard](images/dashborad.png)
![ClientDetails](images/client_details.png)

### 连接管理 (Connections)
![Connections](images/connections.png)

### 核心消息 (Pub/Sub)
![Publish/Subscribe](images/pub-1.png)
![Request/Reply](images/pub-2.png)

### JetStream
![JetStream Consumer](images/jetstream-1.png)
![JetStream Details](images/jetstream-2.png)
![JetStream Message](images/jetstream-3.png)

### 键值存储 (KV Store)
![KV Store](images/kv-1.png)
![KV History](images/kv-2.png)
![KV Diff](images/kv-3.png)

### 对象存储 (Object Store)
![Object Store](images/obj_store.png)

### 微服务自动发现 (Services)
![Services List](images/services-1.png)
![Service Details](images/services-2.png)

---

## ⚙️ 配置项

GNATS 支持通过环境变量进行配置：

| 环境变量 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `ADDRESS` | Web UI 监听的绑定地址（支持 IP:PORT 或 :PORT 格式）。 | `:8080` |
| `CONNECTIONS_FILE` | 连接配置文件的保存/加载路径。 | `connections.json` |
| `DEBUG` | 设置为 `true` 时，将实时读取 `ui/dist` 文件夹而非嵌入文件。 | `false` |

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

### 本地开发调试（非 Docker 模式）

1. **构建前端**:
   ```bash
   cd ui
   npm install
   npm run build
   cd ..
   ```

2. **启动服务端**:
   ```bash
   go run cmd/gnats/main.go
   ```

3. **运行测试数据模拟器 (可选)**:
   我们提供了一个测试数据生成器，用来往 NATS 写入各种测试数据。详见 [cmd/demo/README_zh.md](cmd/demo/README_zh.md)。
   ```bash
   go run cmd/demo/main.go
   ```

---

## 🛠 技术栈

- **后端**: [Go 1.26](https://golang.org/) + [chi](https://github.com/go-chi/chi) (RESTful API) + [nats.go](https://github.com/nats-io/nats.go)
- **前端**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
- **视觉**: [Lucide Icons](https://lucide.dev/) + [Recharts](https://recharts.org/) + 原生 CSS 变量
- **国际化**: [i18next](https://www.i18next.com/)
- **部署**: `go:embed` + Docker 多阶段构建 (单二进制文件)

---

## 🗺️ 路线图 (Roadmap)

- [x] **Request-Reply（请求-响应）调试面板**: 提供专用界面，支持发送请求并同步等待、自定义回复主题（Reply-To）与超时时间，并支持前端一键取消挂起请求。
- [x] **消费者 (Consumer) 全生命周期管理**: 图形化创建、详细配置以及操作管理 JetStream 消费者（含 Push/Pull 模式透明降级兼容）。
- [x] **Key 的历史版本 (History) 回溯与回滚**: 查看 KV 键的历史修改版本，并支持一键回滚到历史版本。
- [x] **Key-Value 历史版本差异比对 (KV Diff Viewer)**: 历史版本之间的可视化左右分栏（Side-by-side）比对差异。
- [ ] **NATS 集群多维拓扑与监控**: 可视化展示集群拓扑图，包括 Leafnodes（叶子节点）与集群路由的状态、延迟（RTT）和传输带宽。
- [ ] **微服务调试面板增强**: 支持基于 `$SRV.SCHEMA` 的服务 Schema 自动发现，并在服务面板中集成一键 Endpoint 接口在线调试功能。
- [ ] **Payload 编辑器语法高亮与格式化**: 在消息发布/请求面板集成富文本编辑器，支持 JSON/YAML 语法高亮、自动格式化与合法性验证。
- [ ] **KV Store 单 Key 生命周期管理**: 支持为单个 KV 键配置过期时间（TTL），并在前端界面展示生命周期与过期倒计时。

---

## 📄 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源协议。
