# GNATS NATS 模拟测试数据生成器

[English](README.md)

这是一个轻量级且功能全面的模拟数据生成与流量仿真工具，专门用于向 NATS 服务器中写入各种测试数据。这使得您可以快速填满 NATS 资源，从而完整体验并测试 `gnats` 管理后台的各项功能。

## 🎯 覆盖的模块与模拟数据

本工具运行后会自动检测、创建并在后台维护以下资源：

### 1. Key-Value 键值存储 (KV)
- **settings_kv**：限制历史版本为 5 次的 KV 桶。
  - 键值对：`theme: dark`，`max_limit: 100`，`debug_mode: true`。
  - 自动对键 `dynamic_config` 写入 3 次历史数据，便于在后台调试 **查看 KV 历史** 及 **版本回滚** 功能。
- **user_profiles**：无历史限制的普通 KV 桶。
  - 写入模拟的 JSON 用户数据，如 `user.1001` 和 `user.1002`。

### 2. Object Store 对象存储
- **documents_bucket**：创建对象存储桶。
  - 写入 3 个不同格式的模拟文件：`report.txt` (纯文本)，`config.json` (JSON 配置)，`notes.md` (Markdown 笔记)。

### 3. JetStream 流与消费者
- **ORDERS 流**：绑定主题 `orders.>`。
  - 写入 3 条初始订单消息（JSON 格式）。
  - 创建 **Pull 消费者**：`processor_pull`。
  - 创建 **Push 消费者**：`monitor_push`（投递主题为 `orders.monitor.delivery`）。
- **SYSTEM_LOGS 流**：绑定主题 `logs.>`。
  - 写入 3 条分别包含 `info`、`warn` 和 `error` 的日志记录。

### 4. Microservices 微服务
- 注册并运行名为 **order-service (v1.0.0)** 的微服务。
- 注册两个端点（Endpoints）：
  - `orders.service.create` (订阅 `orders.service.create`)：返回模拟订单创建成功的 JSON 数据。
  - `orders.service.get` (订阅 `orders.service.get`)：返回订单详情 JSON 数据。
- **服务发现**：该微服务会自动响应 `$SRV.PING` 请求，从而使它展示在 `gnats` 的 "Services" 功能标签中。

### 5. 持续流量模拟 (Traffic Simulator)
程序在运行期间会启动后台 Goroutines 模拟生产流量：
- **普通订阅者**：在后台自动订阅 `notifications.>`，用于验证标准发布/订阅的接收。
- **流量触发**：
  - 每隔 **4 秒** 向 `notifications.<level>` 发布一条通知消息。
  - 每隔 **6 秒** 交替向微服务发送 `create` 和 `get` 请求，并接收其响应，用以在 `gnats` 前台渲染实时的 QPS、延迟和请求量图表。

---

## 🚀 启动说明

确保您的 NATS 服务已启动且开启了 JetStream (可以使用 `-js` 启动参数)。

在项目根目录下，直接运行以下命令：

```bash
# 1. 默认连接本地 NATS（nats://localhost:4222）
go run cmd/demo/main.go

# 2. 连接特定的远程/内网 NATS 服务器
go run cmd/demo/main.go -url nats://10.19.1.4:4222
```

程序启动后会在控制台实时打印消息的发布、订阅和响应记录。按 `Ctrl+C` 即可退出模拟器并清理资源。
