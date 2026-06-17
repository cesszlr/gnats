package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/nats-io/nats.go/micro"
)

func main() {
	natsURL := flag.String("url", nats.DefaultURL, "NATS server URL")
	flag.Parse()

	log.Printf("Connecting to NATS at %s...", *natsURL)
	nc, err := nats.Connect(*natsURL)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer nc.Close()
	log.Println("Connected successfully!")

	// Use a background context for setups
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	js, err := jetstream.New(nc)
	if err != nil {
		log.Fatalf("Failed to initialize JetStream: %v", err)
	}

	// 1. Key-Value Store setup
	setupKV(ctx, js)

	// 2. Object Store setup
	setupObjectStore(ctx, js)

	// 3. JetStream Stream & Consumers setup
	setupJetStream(ctx, js)

	// 4. Microservice setup
	srv := setupMicroservice(nc)
	defer srv.Stop()

	paySrv := setupPaymentService(nc)
	defer paySrv.Stop()

	// 5. Start background traffic simulators
	stopSimulators := runSimulators(nc, js)
	defer stopSimulators()

	// Keep running until interrupted
	log.Println("\n==================================================")
	log.Println("Demo is running successfully!")
	log.Println("Press Ctrl+C to terminate the simulator and clean up.")
	log.Println("==================================================")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down NATS demo...")
}

func setupKV(ctx context.Context, js jetstream.JetStream) {
	log.Println("Setting up Key-Value Buckets...")

	// Create settings KV bucket
	settingsKV, err := js.CreateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:      "settings_kv",
		Description: "System configuration settings and feature flags",
		History:     5, // Keep up to 5 history records
	})
	if err != nil {
		log.Fatalf("Failed to create KV bucket settings_kv: %v", err)
	}

	// Put some initial keys
	keys := map[string]string{
		"theme":            "dark",
		"max_limit":        "100",
		"debug_mode":       "true",
		"api_timeout":      "5000ms",
		"retry_count":      "3",
		"enable_cors":      "true",
		"log_level":        "debug",
		"max_connections":  "10000",
		"rate_limit_rpm":   "120",
		"allowed_origins":  "https://*.example.com,http://localhost:3000",
	}
	for k, v := range keys {
		if _, err := settingsKV.Put(ctx, k, []byte(v)); err != nil {
			log.Printf("Failed to put key %s: %v", k, err)
		}
	}

	// Modify one of the keys a few times to create history
	for i := 1; i <= 3; i++ {
		val := fmt.Sprintf(`{
  "version": %d,
  "theme": "dark",
  "debug_mode": true,
  "max_connections": 10000,
  "allowed_origins": [
    "https://*.example.com",
    "http://localhost:3000"
  ],
  "rate_limit": {
    "rpm": 120,
    "burst": 20
  }
}`, i)
		if _, err := settingsKV.Put(ctx, "dynamic_config", []byte(val)); err != nil {
			log.Printf("Failed to put dynamic_config history: %v", err)
		}
		time.Sleep(50 * time.Millisecond)
	}

	// Create user_profiles KV bucket
	profilesKV, err := js.CreateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:      "user_profiles",
		Description: "User profile details and authentication meta",
	})
	if err != nil {
		log.Fatalf("Failed to create KV bucket user_profiles: %v", err)
	}

	profiles := map[string]string{
		"user.1001": `{"name":"Alice Smith","role":"admin","email":"alice@example.com","status":"active","dept":"IT","last_login":"2026-06-17T12:00:00Z","permissions":["read","write","delete"]}`,
		"user.1002": `{"name":"Bob Jones","role":"user","email":"bob@example.com","status":"active","dept":"Sales","last_login":"2026-06-17T15:30:00Z","permissions":["read"]}`,
		"user.1003": `{"name":"Charlie Brown","role":"manager","email":"charlie@example.com","status":"suspended","dept":"Finance","last_login":"2026-06-15T09:15:00Z","permissions":["read","write"]}`,
	}
	for k, v := range profiles {
		if _, err := profilesKV.Put(ctx, k, []byte(v)); err != nil {
			log.Printf("Failed to put key %s: %v", k, err)
		}
	}

	// Create feature_flags KV bucket
	flagsKV, err := js.CreateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:      "feature_flags",
		Description: "Dynamic toggles for system features",
		History:     3,
	})
	if err != nil {
		log.Fatalf("Failed to create KV bucket feature_flags: %v", err)
	}

	flags := map[string]string{
		"new_dashboard_ui":     "true",
		"beta_payments":        "false",
		"maintenance_mode":     "false",
		"promo_banner_active":  "true",
	}
	for k, v := range flags {
		if _, err := flagsKV.Put(ctx, k, []byte(v)); err != nil {
			log.Printf("Failed to put flag %s: %v", k, err)
		}
	}
	log.Println("KV Buckets set up successfully!")
}

func setupObjectStore(ctx context.Context, js jetstream.JetStream) {
	log.Println("Setting up Object Store Buckets...")

	obs, err := js.CreateObjectStore(ctx, jetstream.ObjectStoreConfig{
		Bucket:      "documents_bucket",
		Description: "Repository for test documents and system backups",
		Metadata: map[string]string{
			"owner":       "DevOps",
			"tier":        "cold-storage",
			"retention":   "30-days",
			"compression": "gzip",
		},
	})
	if err != nil {
		log.Fatalf("Failed to create Object Store: %v", err)
	}

	// Put some objects with metadata
	files := []struct {
		name        string
		description string
		content     string
		metadata    map[string]string
	}{
		{
			"report.txt",
			"Annual financial report",
			"This is a simple textual report generated for NATS Object Store testing.",
			map[string]string{"format": "text", "author": "Alice", "confidential": "true"},
		},
		{
			"config.json",
			"Production infrastructure configurations",
			`{"environment": "production", "debug": false, "version": "1.0.4"}`,
			map[string]string{"format": "json", "app": "core-api", "version": "1.0.4"},
		},
		{
			"notes.md",
			"System patch release details",
			"# Release Notes\n\n- Fix bugs\n- Add Object Store\n- Improve performance",
			map[string]string{"format": "markdown", "type": "changelog", "status": "approved"},
		},
		{
			"sales_charts.png",
			"Marketing performance charts",
			"MOCK_BINARY_PNG_DATA_CONTENT",
			map[string]string{"format": "image", "width": "1920", "height": "1080", "department": "Marketing"},
		},
	}

	for _, f := range files {
		meta := jetstream.ObjectMeta{
			Name:        f.name,
			Description: f.description,
			Metadata:    f.metadata,
		}
		_, err := obs.Put(ctx, meta, strings.NewReader(f.content))
		if err != nil {
			log.Printf("Failed to put object %s: %v", f.name, err)
		}
	}
	log.Println("Object Store Buckets set up successfully!")
}

func setupJetStream(ctx context.Context, js jetstream.JetStream) {
	log.Println("Setting up JetStream Streams and Consumers...")

	// Create Stream ORDERS
	streamCfg := jetstream.StreamConfig{
		Name:        "ORDERS",
		Subjects:    []string{"orders.>"},
		Description: "Stream tracking e-commerce orders, payments, and shipments",
		MaxMsgs:     50000,
		MaxBytes:    100 * 1024 * 1024,   // 100MB
		MaxAge:      30 * 24 * time.Hour, // 30 days
		Storage:     jetstream.FileStorage,
		Replicas:    1,
		Metadata: map[string]string{
			"billing_code": "eCommerce-101",
			"domain":       "orders",
			"pci_dss":      "compliant",
		},
	}
	stream, err := js.CreateStream(ctx, streamCfg)
	if err != nil {
		log.Fatalf("Failed to create stream ORDERS: %v", err)
	}

	// Create Stream SYSTEM_LOGS
	logStreamCfg := jetstream.StreamConfig{
		Name:        "SYSTEM_LOGS",
		Subjects:    []string{"logs.>"},
		Description: "Stream tracking system runtime logs, exceptions, and trace metrics",
		MaxAge:      7 * 24 * time.Hour, // 7 days
		Storage:     jetstream.MemoryStorage,
		Metadata: map[string]string{
			"owner":            "DevOps",
			"retention_policy": "delete",
			"compliance":       "none",
		},
	}
	_, err = js.CreateStream(ctx, logStreamCfg)
	if err != nil {
		log.Fatalf("Failed to create stream SYSTEM_LOGS: %v", err)
	}

	// Create Stream USER_EVENTS
	userEventsCfg := jetstream.StreamConfig{
		Name:        "USER_EVENTS",
		Subjects:    []string{"users.events.>"},
		Description: "Stream capturing user behavior, clicks, page views, and actions",
		MaxMsgs:     10000,
		Storage:     jetstream.MemoryStorage,
		Metadata: map[string]string{
			"department": "Analytics",
			"gdpr":       "anonymized",
		},
	}
	userStream, err := js.CreateStream(ctx, userEventsCfg)
	if err != nil {
		log.Fatalf("Failed to create stream USER_EVENTS: %v", err)
	}

	// Publish initial messages to ORDERS
	orders := []string{
		`{"id":"ORD-001","items":["book","pen"],"total":25.50,"status":"pending"}`,
		`{"id":"ORD-002","items":["laptop"],"total":1200.00,"status":"paid"}`,
		`{"id":"ORD-003","items":["headphones"],"total":89.99,"status":"shipped"}`,
	}
	for i, ord := range orders {
		subject := fmt.Sprintf("orders.created.%d", i+1)
		_, err := js.Publish(ctx, subject, []byte(ord))
		if err != nil {
			log.Printf("Failed to publish order message to stream: %v", err)
		}
	}

	// Publish initial messages to SYSTEM_LOGS
	logMessages := []struct {
		level   string
		message string
	}{
		{"info", "System started successfully"},
		{"warn", "High memory usage detected"},
		{"error", "Database connection timeout"},
	}
	for _, l := range logMessages {
		subject := fmt.Sprintf("logs.%s", l.level)
		payload := fmt.Sprintf(`{"time":"%s","level":"%s","msg":"%s"}`, time.Now().Format(time.RFC3339), l.level, l.message)
		_, err := js.Publish(ctx, subject, []byte(payload))
		if err != nil {
			log.Printf("Failed to publish log message to stream: %v", err)
		}
	}

	// Create Pull Consumer on ORDERS
	pullCfg := jetstream.ConsumerConfig{
		Durable:       "processor_pull",
		Description:   "Durable pull consumer for async orders payment processing",
		FilterSubject: "orders.created.>",
		MaxDeliver:    5,
		AckWait:       30 * time.Second,
		MaxAckPending: 2000,
		Metadata: map[string]string{
			"priority": "high",
			"runner":   "k8s-pod-1",
			"engine":   "v3-worker",
		},
	}
	_, err = stream.CreateOrUpdateConsumer(ctx, pullCfg)
	if err != nil {
		log.Printf("Failed to create Pull Consumer: %v", err)
	}

	// Create Push Consumer on ORDERS
	pushCfg := jetstream.ConsumerConfig{
		Durable:        "monitor_push",
		DeliverSubject: "orders.monitor.delivery",
		Description:    "Durable push consumer for near real-time order monitoring",
		AckPolicy:      jetstream.AckExplicitPolicy,
		Metadata: map[string]string{
			"alert_email": "devops-alerts@example.com",
			"channel":     "slack-finance",
		},
	}
	_, err = stream.CreateOrUpdateConsumer(ctx, pushCfg)
	if err != nil {
		log.Printf("Failed to create Push Consumer: %v", err)
	}

	// Create Ephemeral Consumer on ORDERS
	_, err = stream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Description:   "Ephemeral consumer for live analytical graphs",
		FilterSubject: "orders.created.>",
		AckPolicy:     jetstream.AckNonePolicy,
		Metadata: map[string]string{
			"purpose": "analytics",
		},
	})
	if err != nil {
		log.Printf("Failed to create Ephemeral Consumer: %v", err)
	}

	// Create Durable Consumer on USER_EVENTS
	_, err = userStream.CreateOrUpdateConsumer(ctx, jetstream.ConsumerConfig{
		Durable:     "analytics_aggregator",
		Description: "Durable consumer aggregating click and session events",
		Metadata: map[string]string{
			"owner": "bi-team",
		},
	})
	if err != nil {
		log.Printf("Failed to create Consumer analytics_aggregator: %v", err)
	}

	log.Println("JetStream Streams and Consumers set up successfully!")
}

func setupMicroservice(nc *nats.Conn) micro.Service {
	log.Println("Setting up Microservice...")
	srv, err := micro.AddService(nc, micro.Config{
		Name:        "order-service",
		Version:     "1.0.0",
		Description: "A mock microservice for processing, retrieving, and deleting orders",
		Metadata: map[string]string{
			"department": "E-Commerce",
			"owner":      "Alpha-Team",
			"env":        "production",
			"region":     "us-east-1",
		},
	})
	if err != nil {
		log.Fatalf("Failed to add microservice: %v", err)
	}

	err = srv.AddEndpoint("create", micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[Microservice] Received create order request: %s", string(req.Data()))
		orderID := fmt.Sprintf("ORD-%d", rand.Intn(900000)+100000)
		resp := map[string]interface{}{
			"status":   "success",
			"order_id": orderID,
			"msg":      "Order created successfully",
		}
		if err := req.RespondJSON(resp); err != nil {
			log.Printf("Failed to respond to create endpoint: %v", err)
		}
	}), micro.WithEndpointSubject("orders.service.create"), micro.WithEndpointMetadata(map[string]string{
		"auth_required": "true",
		"rate_limit":    "100/s",
	}))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'create': %v", err)
	}

	err = srv.AddEndpoint("get", micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[Microservice] Received get order request: %s", string(req.Data()))
		resp := map[string]interface{}{
			"status":   "success",
			"order_id": "ORD-123456",
			"amount":   299.99,
			"items":    []string{"keyboard", "mouse"},
		}
		if err := req.RespondJSON(resp); err != nil {
			log.Printf("Failed to respond to get endpoint: %v", err)
		}
	}), micro.WithEndpointSubject("orders.service.get"), micro.WithEndpointMetadata(map[string]string{
		"cached":    "true",
		"cache_ttl": "60s",
	}))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'get': %v", err)
	}

	err = srv.AddEndpoint("delete", micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[Microservice] Received delete order request: %s", string(req.Data()))
		// Simulate occasional errors (15% chance)
		if rand.Float32() < 0.15 {
			req.Error("500", "Internal Server Error: Database deadlock", nil)
			return
		}
		// Simulate latency (50ms - 150ms)
		time.Sleep(time.Duration(50+rand.Intn(100)) * time.Millisecond)
		resp := map[string]interface{}{
			"status": "success",
			"msg":    "Order deleted successfully",
		}
		if err := req.RespondJSON(resp); err != nil {
			log.Printf("Failed to respond to delete endpoint: %v", err)
		}
	}), micro.WithEndpointSubject("orders.service.delete"), micro.WithEndpointMetadata(map[string]string{
		"danger_zone": "true",
		"role":        "admin",
	}))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'delete': %v", err)
	}

	log.Println("Microservice order-service is registered and listening!")
	return srv
}

func setupPaymentService(nc *nats.Conn) micro.Service {
	log.Println("Setting up Microservice payment-service...")
	srv, err := micro.AddService(nc, micro.Config{
		Name:        "payment-service",
		Version:     "1.2.0",
		Description: "A mock microservice for charging and refunding transactions",
		Metadata: map[string]string{
			"department": "Finance",
			"owner":      "Omega-Team",
			"env":        "staging",
			"gateway":    "stripe",
		},
	})
	if err != nil {
		log.Fatalf("Failed to add microservice payment-service: %v", err)
	}

	err = srv.AddEndpoint("charge", micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[Microservice-Payment] Received charge request: %s", string(req.Data()))
		// Simulate latency (100ms - 300ms)
		time.Sleep(time.Duration(100+rand.Intn(200)) * time.Millisecond)
		
		// 8% error rate
		if rand.Float32() < 0.08 {
			req.Error("400", "Card Declined: Insufficient funds", nil)
			return
		}
		
		resp := map[string]interface{}{
			"status": "success",
			"transaction_id": fmt.Sprintf("TXN-%d", rand.Intn(900000)+100000),
			"amount": 25.50,
		}
		_ = req.RespondJSON(resp)
	}), micro.WithEndpointSubject("payments.service.charge"), micro.WithEndpointMetadata(map[string]string{
		"secure":           "true",
		"max_amount_limit": "5000",
	}))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'charge': %v", err)
	}

	err = srv.AddEndpoint("refund", micro.HandlerFunc(func(req micro.Request) {
		log.Printf("[Microservice-Payment] Received refund request: %s", string(req.Data()))
		resp := map[string]interface{}{
			"status": "success",
			"msg":    "Refund initiated successfully",
		}
		_ = req.RespondJSON(resp)
	}), micro.WithEndpointSubject("payments.service.refund"), micro.WithEndpointMetadata(map[string]string{
		"admin_only": "true",
	}))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'refund': %v", err)
	}

	log.Println("Microservice payment-service is registered and listening!")
	return srv
}

func runSimulators(nc *nats.Conn, js jetstream.JetStream) func() {
	log.Println("Starting background simulators...")
	done := make(chan struct{})

	// 1. Subscribe to core notifications
	sub, err := nc.Subscribe("notifications.>", func(msg *nats.Msg) {
		log.Printf("[Subscriber] Core notification received on [%s]: %s", msg.Subject, string(msg.Data))
	})
	if err != nil {
		log.Printf("Failed to subscribe to notifications: %v", err)
	}

	// 2. Publish core notifications periodically
	go func() {
		ticker := time.NewTicker(4 * time.Second)
		defer ticker.Stop()
		levels := []string{"info", "warn", "critical"}

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				level := levels[rand.Intn(len(levels))]
				subject := fmt.Sprintf("notifications.%s", level)
				payload := fmt.Sprintf(`{"time":"%s","level":"%s","message":"Periodic simulation message"}`, time.Now().Format(time.RFC3339), level)
				if err := nc.Publish(subject, []byte(payload)); err != nil {
					log.Printf("Failed to publish periodic notification: %v", err)
				}
			}
		}
	}()

	// 3. Trigger microservice requests periodically
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				var subject string
				var payload string
				
				r := rand.Float32()
				if r < 0.3 {
					subject = "orders.service.create"
					payload = `{"user_id":"USR-456","items":["monitor"]}`
				} else if r < 0.6 {
					subject = "orders.service.get"
					payload = `{"order_id":"ORD-123456"}`
				} else if r < 0.8 {
					subject = "orders.service.delete"
					payload = `{"order_id":"ORD-123456"}`
				} else {
					subject = "payments.service.charge"
					payload = `{"amount": 150.00, "currency": "USD", "payment_method": "pm_card_visa"}`
				}

				log.Printf("[Client] Sending request to [%s]", subject)
				msg, err := nc.Request(subject, []byte(payload), 1*time.Second)
				if err != nil {
					log.Printf("[Client] Request to [%s] failed: %v", subject, err)
				} else {
					log.Printf("[Client] Response from [%s]: %s", subject, string(msg.Data))
				}
			}
		}
	}()

	// 4. Publish core user events periodically to USER_EVENTS stream
	go func() {
		ticker := time.NewTicker(4 * time.Second)
		defer ticker.Stop()
		events := []string{"click", "page_view", "scroll", "purchase_intent"}
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				evt := events[rand.Intn(len(events))]
				subject := fmt.Sprintf("users.events.%s", evt)
				payload := fmt.Sprintf(`{"timestamp":"%s","user_id":"USR-%d","event_type":"%s","page":"/home"}`, time.Now().Format(time.RFC3339), rand.Intn(1000)+1000, evt)
				_, err := js.Publish(context.Background(), subject, []byte(payload))
				if err != nil {
					log.Printf("Failed to publish user event to stream: %v", err)
				}
			}
		}
	}()

	return func() {
		close(done)
		if sub != nil {
			sub.Unsubscribe()
		}
		log.Println("Simulators stopped.")
	}
}
