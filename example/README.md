# NATS Demo & Cluster Evaluation Environment (Docker Compose)

This directory provides a fully functional, one-click local multi-node evaluation environment. It contains a 3-node main NATS cluster, a NATS Leaf Node connected to it, the `gnats` monitoring Web Console from this project, and an automatic traffic injector.

---

## Architecture & Topology

This environment is orchestrated using Docker Compose, consisting of the following services:

```
                    ┌──────────────┐
                    │    gnats     │  (Monitoring UI, running on port 8085)
                    └──────┬───────┘
                           │ (Switch connection between nats-1 and nats-leaf)
                           ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                      Main NATS Cluster                       │
 │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐      │
 │  │    nats-1    │◄─►│    nats-2    │◄─►│    nats-3    │      │
 │  │ (Seed, JS On)│   │  (JS On)     │   │  (JS On)     │      │
 │  └──────┬───────┘   └──────────────┘   └──────────────┘      │
 │         ▲                                                    │
 └─────────┼────────────────────────────────────────────────────┘
           │ (Leaf Node Bridge TCP 7422)
           ▼
 ┌─────────────────┐
 │    nats-leaf    │ (Leaf Node, Core NATS only, mapped to host port 4223)
 └─────────────────┘
           ▲
           │ (Core messages & microservice routes transparently forwarded)
           ▼
 ┌─────────────────┐
 │  demo-injector  │ (Continuously injects Streams/KVs/Services into nats-1)
 └─────────────────┘
```

### 1. 3-Node Main NATS Cluster (Hub)
- Consists of services `nats-1`, `nats-2`, and `nats-3`.
- The nodes establish mesh routing with each other over port `6222` under the cluster name `"nats-cluster"`.
- All three nodes have **JetStream** enabled (`-js`), forming a highly available Raft group for metadata and message storage.
- `nats-1` acts as the seed node of the cluster and additionally listens on port `7422` for incoming leaf node connections.

### 2. Lightweight Leaf Node
- Represented by the `nats-leaf` service, which bridges to the main cluster at `nats-1:7422` using the configuration defined in `nats-leaf.conf`.
- **JetStream Architecture on the Leaf Node**:
  - The leaf node in this environment has **local JetStream storage disabled**.
  - According to NATS design, enabling JetStream locally requires the leaf node to manage its own state (Store-and-Forward pattern). Without a hard requirement for offline local persistence, keeping local JS disabled saves significant memory and disk resources on edge nodes.
  - Despite having local JS disabled, the leaf node transparently routes Core NATS traffic to and from the hub. This means **microservices (Services) and Core Pub/Sub messages published on the main cluster are automatically routed to the leaf node**, allowing clients connected to the leaf node to call and subscribe to them transparently.

### 3. Traffic Injector (demo-injector)
- Represented by the `demo-injector` service, which runs the `demo` client application from the codebase.
- Upon container startup, it waits for `nats-1:4222` to become reachable and **sleeps for an additional 8 seconds** (giving the NATS cluster enough time to complete JetStream Raft election and metadata synchronization) before initiating connection and traffic injection.
- The injected metadata and traffic include:
  - Creating a Key-Value bucket named `settings_kv`.
  - Creating an Object Store bucket named `configs_object`.
  - Creating a JetStream stream named `ORDERS`.
  - Registering and running two microservices: `order-service` and `payment-service`, and simulating real-time requests/responses (order creation, deletion, charge payments, etc.) at a high frequency.

### 4. Monitoring Console (gnats)
- Runs the `gnats` console UI backend from this project, exposing port **`8085`** to the host machine (adjusted from `8080` to prevent conflicts with other local dev servers).
- Pre-configured with two connection options via the mounted `connections.json` file:
  - **`Main NATS Cluster (nats-1)`**: Connects directly to the main cluster.
  - **`Leaf Node (nats-leaf)`**: Connects to the lightweight leaf node.

---

## Quick Start

### 1. Start the Environment
Run the following command from the `example/` directory (or from the project root by specifying the `-f` flag):

```bash
# Start from the example/ directory
docker compose up -d

# Or start from the project root directory
docker compose -f example/docker-compose.yml up -d
```

This will build the frontend/backend Docker images and start 5 container instances.

### 2. Access the Console
Once successfully started, open your browser and navigate to:
👉 **[http://localhost:8085](http://localhost:8085)**

### 3. Verification & Comparison
Inside the gnats Web Console, you will see two configured connections:

#### Connection A: Main NATS Cluster (nats-1)
- Once connected, you can view the fully populated metadata dashboard:
  - **Streams** page: View the `ORDERS` stream and see the growing message count.
  - **KV / Object Store** pages: Explore the injected `settings_kv` bucket and its active keys.
  - **Services** page: Monitor real-time traffic statistics for `order-service` and `payment-service`.

#### Connection B: Leaf Node (nats-leaf)
- Switch to this connection:
  - **KV / Object Store / Stream** pages: Show as empty (expected, since local JS is disabled on the leaf node, achieving storage isolation).
  - **Services** page: **Successfully displays and permits invocations of `order-service` and `payment-service`**!

### 4. Tear Down
To stop and clean up all services and containers, run:

```bash
docker compose down
```
