# GNATS - Modern NATS Management GUI

[中文](README_zh.md)

GNATS is a modern, lightweight, and powerful open-source management interface designed for [NATS.io](https://nats.io). It provides an intuitive Web UI to help developers and operators easily manage NATS clusters, monitor real-time messages, configure JetStream, and operate KV stores.

![License](https://img.shields.io/badge/license-Apache--2.0-green.svg)
![Go Version](https://img.shields.io/badge/Go-1.26-00ADD8.svg?style=flat&logo=go)
![React Version](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat&logo=react)

---

## ✨ Core Features

- 🔌 **Multi-Connection Management**: 
    - **Single Active Connection**: Smart toggling system that automatically manages background resources when switching environments.
    - **Connection Editing**: Easily update existing configurations via a unified Modal interface.
    - **Advanced TLS**: Support for both file paths and direct PEM content pasting.
- 📊 **Account-Wide Monitoring**: 
    - **NATS Monitoring Integration**: Direct integration with NATS `/accstatz` and `/connz` endpoints for precise metrics.
    - **Multi-Account Selection**: Seamlessly switch between different NATS Accounts to monitor isolated traffic.
    - **Active Client Tracking**: Monitor Top 10 stressed clients with server-side sorting (by pending bytes, sent/received messages).
    - **Real-time Statistics**: Accurate throughput charts (msgs/s) and high-fidelity animations.
- 🚀 **Core Messaging (Pub/Sub)**: 
    - Subscribe to subjects in real-time and view incoming messages.
    - Publish messages with custom Payloads, Headers, and Reply-To addresses.
- 🌊 **JetStream Management**:
    - **Visual Distribution**: Charts showing message volume across top streams.
    - Create, view, purge, and delete Streams.
    - View message content in Streams in real-time (supports JSON/YAML formatting).
    - Monitor Consumer status and progress.
- 🔑 **KV Store**:
    - Manage Buckets with configuration for TTL, history, and replicas.
    - **Professional Editor**: Integrated **CodeMirror 6** for high-performance value editing.
    - **Syntax Highlighting**: Real-time formatting and auto-indentation for JSON/YAML.
    - Easy CRUD operations for Keys.
- 📦 **Object Store**: Support for bucket management and object lifecycle operations.
- 🔍 **Service Discovery**: Automatically discover and display services built with the NATS Micro framework.
- 📦 **Single Binary Distribution**: Frontend assets are embedded directly into the Go binary for zero-dependency deployment.
- 🌓 **Premium Experience**:
    - **Dark/Light Mode** automatic switching.
    - **Multi-language Support**: Full English and Chinese interface localization.
    - **Rich Tooltips & Modals**: Detailed connection info with network latency (RTT) and throughput analysis.
    - **Responsive Design**: Adapts to various screen sizes.

---

## 📸 Screenshots

### Dashboard
![Dashboard](images/dashborad.png)
![ClientDetails](images/client_details.png)

### Connection Management
![Connections](images/connections.png)

### Core Pub/Sub
![Publish/Subscribe](images/pub.png)

### KV Store
![KV Store](images/kv.png)

---

## ⚙️ Configuration

GNATS can be configured using environment variables:

| Environment Variable | Description | Default Value |
| :--- | :--- | :--- |
| `PORT` | The port the Web UI will listen on. | `8080` |
| `CONNECTIONS_FILE` | Path to save/load connection configurations. | `connections.json` |
| `DEBUG` | If set to `true`, serves static files from `ui/dist` instead of embedded files. | `false` |

---

## 🚀 Quick Start

### Using Docker (Recommended)

The fastest way to get started. The image is extremely small as it only contains the single binary.

1. **Pull Image**:
   ```bash
   docker pull cesszlr/gnats:latest
   ```

2. **Run Container**:
   ```bash
   docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e CONNECTIONS_FILE=/app/data/connections.json --name gnats-app cesszlr/gnats:latest
   ```

3. **Access**: Open your browser and visit `http://localhost:8080`

### Build from source using Docker

1. **Build Image**:
   ```bash
   docker build -t gnats-gui .
   ```

2. **Run Container**:
   ```bash
   docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e CONNECTIONS_FILE=/app/data/connections.json --name gnats-app gnats-gui
   ```

---

## 🛠 Tech Stack

- **Backend**: [Go 1.26](https://golang.org/) + [chi](https://github.com/go-chi/chi) (RESTful API) + [nats.go](https://github.com/nats-io/nats.go)
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
- **Visuals**: [Lucide Icons](https://lucide.dev/) + [Recharts](https://recharts.org/) + Vanilla CSS
- **i18n**: [i18next](https://www.i18next.com/)
- **Deployment**: `go:embed` + Docker Multi-stage Build (Single Binary)

---

## 🗺️ Roadmap

- [ ] **Request-Reply Debugging Panel**: A dedicated interface for publishing messages and awaiting/rendering the response synchronously.
- [ ] **Consumer Lifecycle Management**: Graphical creation, detailed configuration, and operation of JetStream Consumers.
- [ ] **Key History & Rollback**: View historical revisions of KV keys and easily rollback to past versions.

---

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).
