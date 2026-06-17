# GNATS NATS 模拟测试数据生成器

[English](README.md)

这是一个轻量级且功能全面的模拟数据生成与流量仿真工具，专门用于向 NATS 服务器中写入各种测试数据。这使得您可以快速填满 NATS 资源，从而完整体验并测试 `gnats` 管理后台的各项功能。

## 🎯 覆盖的模块与模拟数据

本工具运行后会自动检测、创建并在后台维护以下资源：

### 1. Key-Value 键值存储 (KV)
- **settings_kv**：限制历史版本为 5 次的 KV 桶。
  - 描述：`System configuration settings and feature flags`
  - 初始键值对：`theme: dark`，`max_limit: 100`，`debug_mode: true`，`api_timeout: 5000ms`，`retry_count: 3`，`enable_cors: true`，`log_level: debug`，`max_connections: 10000`，`rate_limit_rpm: 120`。
  - 自动对键 `dynamic_config` 写入 3 次历史数据，便于在后台调试 **查看 KV 历史** 及 **版本回滚** 功能。
- **user_profiles**：无历史限制的普通 KV 桶。
  - 描述：`User profile details and authentication meta`
  - 写入包含权限及部门属性的 JSON 用户数据，如 `user.1001`、`user.1002` 和 `user.1003`。
- **feature_flags**：动态 KV 桶。
  - 描述：`Dynamic toggles for system features`
  - 初始开关：`new_dashboard_ui: true`, `beta_payments: false`, `maintenance_mode: false`, `promo_banner_active: true`。

### 2. Object Store 对象存储
- **documents_bucket**：创建对象存储桶，附带元数据：`owner: DevOps`, `tier: cold-storage`, `retention: 30-days`, `compression: gzip`。
- 写入 4 个不同格式的模拟文件，并携带特定的说明以及对象元数据：
  - `report.txt` (纯文本)：说明：`Annual financial report`，元数据：`format: text`, `author: Alice`, `confidential: true`。
  - `config.json` (JSON 配置)：说明：`Production infrastructure configurations`，元数据：`format: json`, `app: core-api`, `version: 1.0.4`。
  - `notes.md` (Markdown 笔记)：说明：`System patch release details`，元数据：`format: markdown`, `type: changelog`, `status: approved`。
  - `sales_charts.png` (二进制图片)：说明：`Marketing performance charts`，元数据：`format: image`, `width: 1920`, `height: 1080`, `department: Marketing`。

### 3. JetStream 流与消费者
- **ORDERS 流**：绑定主题 `orders.>`。
  - 描述：`Stream tracking e-commerce orders, payments, and shipments`
  - 配置选项：`MaxMsgs: 50000`, `MaxBytes: 100MB`, `MaxAge: 30 days`, `Storage: File`, `Replicas: 1`。
  - 元数据：`billing_code: eCommerce-101`, `domain: orders`, `pci_dss: compliant`。
  - 消费者：
    - **processor_pull** (Durable Pull)：描述：`async orders payment processing`，Filter：`orders.created.>`，元数据：`priority: high`、`runner: k8s-pod-1`。
    - **monitor_push** (Durable Push)：描述：`near real-time order monitoring`，投递主题：`orders.monitor.delivery`，元数据：`alert_email: devops-alerts@example.com`。
    - **Ephemeral 消费者**：描述：`live analytical graphs`，Filter：`orders.created.>`，确认策略：`AckNone`。
- **SYSTEM_LOGS 流**：绑定主题 `logs.>`。
  - 描述：`Stream tracking system runtime logs, exceptions, and trace metrics`，`Storage: Memory`，`MaxAge: 7 days`。
  - 元数据：`owner: DevOps`, `retention_policy: delete`。
- **USER_EVENTS 流**：绑定主题 `users.events.>`。
  - 描述：`Stream capturing user behavior, clicks, page views, and actions`，`Storage: Memory`，限制最大消息数：`10000`。
  - 元数据：`department: Analytics`, `gdpr: anonymized`。
  - 消费者：
    - **analytics_aggregator** (Durable Pull)：描述：`aggregating click and session events`，元数据：`owner: bi-team`。

### 4. Microservices 微服务
- **order-service (v1.0.0)**：
  - 描述：`A mock microservice for processing, retrieving, and deleting orders`
  - 服务级元数据 (Metadata)：`department: E-Commerce`、`owner: Alpha-Team`、`env: production`、`region: us-east-1`。
  - 注册端点（Endpoints）：
    - `create` (主题: `orders.service.create`)。元数据: `auth_required: true`, `rate_limit: 100/s`。
    - `get` (主题: `orders.service.get`)。元数据: `cached: true`, `cache_ttl: 60s`。
    - `delete` (主题: `orders.service.delete`)。元数据: `danger_zone: true`, `role: admin`。（模拟 15% 数据库死锁错误和 50-150ms 延迟）。
- **payment-service (v1.2.0)**：
  - 描述：`A mock microservice for charging and refunding transactions`
  - 服务级元数据 (Metadata)：`department: Finance`、`owner: Omega-Team`、`env: staging`、`gateway: stripe`。
  - 注册端点（Endpoints）：
    - `charge` (主题: `payments.service.charge`)。元数据: `secure: true`, `max_amount_limit: 5000`。（模拟 8% 的信用卡拒绝和 100-300ms 延迟）。
    - `refund` (主题: `payments.service.refund`)。元数据: `admin_only: true`。

### 5. 持续流量模拟 (Traffic Simulator)
程序在运行期间会启动后台 Goroutines 模拟生产流量：
- **普通订阅者**：在后台自动订阅 `notifications.>`，用于验证标准发布/订阅的接收。
- **流量触发**：
  - 每隔 **4 秒** 向 `notifications.<level>` 发布一条通知消息。
  - 每隔 **5 秒** 随机向微服务（`create`、`get`、`delete`、`charge`）发送请求并接收其响应，用以在后台渲染实时的 QPS、延迟、错误率和请求量。
  - 每隔 **4 秒** 向 `USER_EVENTS` 流绑定的 `users.events.>` 主题发送用户的点击、翻页、滚动行为，产生实时吞吐量。

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
