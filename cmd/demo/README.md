# GNATS - NATS Mock Test Data Generator

[中文](README_zh.md)

This is a lightweight and full-featured mock data generator and traffic simulator designed to write various test data into your NATS server. This allows you to quickly populate NATS resources to fully experience and test the capabilities of the `gnats` management dashboard.

## 🎯 Covered Modules & Simulated Data

Upon running, the generator automatically detects, creates, and maintains the following resources:

### 1. Key-Value Store (KV)
- **settings_kv**: A KV bucket with a history limit of 5.
  - Description: `System configuration settings and feature flags`
  - Initial key-values: `theme: dark`, `max_limit: 100`, `debug_mode: true`, `api_timeout: 5000ms`, `retry_count: 3`, `enable_cors: true`, `log_level: debug`, `max_connections: 10000`, `rate_limit_rpm: 120`.
  - Automatically writes historical updates to the `dynamic_config` key 3 times for testing KV history & rollback.
- **user_profiles**: A standard KV bucket without history limits.
  - Description: `User profile details and authentication meta`
  - Populates rich JSON mock profiles containing permissions and department info for `user.1001`, `user.1002`, and `user.1003`.
- **feature_flags**: A dynamic KV bucket.
  - Description: `Dynamic toggles for system features`
  - Initial toggles: `new_dashboard_ui: true`, `beta_payments: false`, `maintenance_mode: false`, `promo_banner_active: true`.

### 2. Object Store
- **documents_bucket**: An object store bucket containing metadata: `owner: DevOps`, `tier: cold-storage`, `retention: 30-days`, `compression: gzip`.
- Populates 4 mock files with customized descriptions and object-level metadata:
  - `report.txt`: Description: `Annual financial report`. Metadata: `format: text`, `author: Alice`, `confidential: true`.
  - `config.json`: Description: `Production infrastructure configurations`. Metadata: `format: json`, `app: core-api`, `version: 1.0.4`.
  - `notes.md`: Description: `System patch release details`. Metadata: `format: markdown`, `type: changog`, `status: approved`.
  - `sales_charts.png`: Description: `Marketing performance charts`. Metadata: `format: image`, `width: 1920`, `height: 1080`, `department: Marketing`.

### 3. JetStream (Streams & Consumers)
- **ORDERS Stream**: Bound to `orders.>` subject.
  - Description: `Stream tracking e-commerce orders, payments, and shipments`
  - Configured with `MaxMsgs: 50000`, `MaxBytes: 100MB`, `MaxAge: 30 days`, `Storage: File`, `Replicas: 1`.
  - Metadata: `billing_code: eCommerce-101`, `domain: orders`, `pci_dss: compliant`.
  - Consumers:
    - **processor_pull** (Durable Pull): Description: `async orders payment processing`, Filter: `orders.created.>`, Metadata: `priority: high`, `runner: k8s-pod-1`.
    - **monitor_push** (Durable Push): Description: `near real-time order monitoring`, DeliverSubject: `orders.monitor.delivery`, Metadata: `alert_email: devops-alerts@example.com`.
    - **Ephemeral Consumer**: Description: `live analytical graphs`, Filter: `orders.created.>`, AckPolicy: `AckNone`.
- **SYSTEM_LOGS Stream**: Bound to `logs.>` subject.
  - Description: `Stream tracking system runtime logs, exceptions, and trace metrics`, `Storage: Memory`, `MaxAge: 7 days`.
  - Metadata: `owner: DevOps`, `retention_policy: delete`.
- **USER_EVENTS Stream**: Bound to `users.events.>` subject.
  - Description: `Stream capturing user behavior, clicks, page views, and actions`, `Storage: Memory`, `MaxMsgs: 10000`.
  - Metadata: `department: Analytics`, `gdpr: anonymized`.
  - Consumers:
    - **analytics_aggregator** (Durable Pull): Description: `aggregating click and session events`.

### 4. Microservices (NATS Micro)
- **order-service (v1.0.0)**:
  - Description: `A mock microservice for processing, retrieving, and deleting orders`
  - Metadata: `department: E-Commerce`, `owner: Alpha-Team`, `env: production`, `region: us-east-1`.
  - Endpoints:
    - `create` (subject: `orders.service.create`). Metadata: `auth_required: true`, `rate_limit: 100/s`.
    - `get` (subject: `orders.service.get`). Metadata: `cached: true`, `cache_ttl: 60s`.
    - `delete` (subject: `orders.service.delete`). Metadata: `danger_zone: true`, `role: admin`. (Simulates 15% database deadlock failure rate and 50-150ms processing latency).
- **payment-service (v1.2.0)**:
  - Description: `A mock microservice for charging and refunding transactions`
  - Metadata: `department: Finance`, `owner: Omega-Team`, `env: staging`, `gateway: stripe`.
  - Endpoints:
    - `charge` (subject: `payments.service.charge`). Metadata: `secure: true`, `max_amount_limit: 5000`. (Simulates 8% card decline failure rate and 100-300ms latency).
    - `refund` (subject: `payments.service.refund`). Metadata: `admin_only: true`.

### 5. Traffic Simulator
While running, background Goroutines will simulate live production traffic:
- **Core Subscriber**: Subscribes to `notifications.>` to output core pub/sub messages.
- **Dynamic Traffic**:
  - Publishes a notification message to `notifications.<level>` every **4 seconds**.
  - Sends alternating requests (`create` / `get` / `delete` / `charge`) to the microservices every **5 seconds** and logs the responses. This will populate service QPS, latency, and error metrics dynamically.
  - Publishes click/scroll user actions to the `USER_EVENTS` stream every **4 seconds** to simulate user behaviour ingestion.

---

## 🚀 Quick Start

Ensure your NATS server is running and JetStream is enabled (using the `-js` flag).

Run the following command from the project root:

```bash
# 1. Connect to local NATS (default: nats://localhost:4222)
go run cmd/demo/main.go

# 2. Connect to a specific remote NATS server
go run cmd/demo/main.go -url nats://10.19.1.4:4222
```

The application will print logs for published, subscribed, and microservice messages. Press `Ctrl+C` to terminate the simulator and clean up resources.
