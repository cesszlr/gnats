# GNATS - NATS Mock Test Data Generator

[中文](README_zh.md)

This is a lightweight and full-featured mock data generator and traffic simulator designed to write various test data into your NATS server. This allows you to quickly populate NATS resources to fully experience and test the capabilities of the `gnats` management dashboard.

## 🎯 Covered Modules & Simulated Data

Upon running, the generator automatically detects, creates, and maintains the following resources:

### 1. Key-Value Store (KV)
- **settings_kv**: A KV bucket with a history limit of 5.
  - Initial key-value pairs: `theme: dark`, `max_limit: 100`, `debug_mode: true`.
  - Automatically writes historical updates to the `dynamic_config` key 3 times, allowing you to test the **View KV History** and **Revision Rollback** features.
- **user_profiles**: A standard KV bucket without history limits.
  - Populates mock JSON user profiles such as `user.1001` and `user.1002`.

### 2. Object Store
- **documents_bucket**: An object store bucket containing 3 mock documents of different formats:
  - `report.txt` (plain text)
  - `config.json` (JSON configuration)
  - `notes.md` (Markdown notes)

### 3. JetStream (Streams & Consumers)
- **ORDERS Stream**: Bound to the `orders.>` subject.
  - Publishes 3 initial order messages (JSON format).
  - Creates a **Pull Consumer**: `processor_pull`.
  - Creates a **Push Consumer**: `monitor_push` (delivering to subject `orders.monitor.delivery`).
- **SYSTEM_LOGS Stream**: Bound to the `logs.>` subject.
  - Publishes 3 initial log messages with `info`, `warn`, and `error` levels.

### 4. Microservices (NATS Micro)
- Registers and runs a microservice named **order-service (v1.0.0)**.
- Exposes two endpoints:
  - `orders.service.create` (subscribes to `orders.service.create`): Responds with order creation success JSON.
  - `orders.service.get` (subscribes to `orders.service.get`): Responds with order detail JSON.
- **Service Discovery**: The service automatically responds to `$SRV.PING` requests, allowing it to be discovered and displayed in the `gnats` "Services" tab.

### 5. Traffic Simulator
While running, background Goroutines will simulate live production traffic:
- **Core Subscriber**: Subscribes to `notifications.>` to output core pub/sub messages.
- **Dynamic Traffic**:
  - Publishes a notification message to `notifications.<level>` every **4 seconds**.
  - Sends alternating requests (`create` / `get`) to the microservice every **6 seconds** and logs the responses. This will update the service statistics (QPS, throughput, latency chart) on the dashboard in real-time.

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
