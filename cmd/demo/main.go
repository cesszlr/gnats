package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
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

	// 5. Start background traffic simulators
	stopSimulators := runSimulators(nc)
	defer stopSimulators()

	// Keep running until interrupted
	log.Println("\n==================================================")
	log.Println("Demo is running successfully!")
	log.Println("Press Ctrl+C to terminate the simulator and clean up.")
	log.Println("==================================================\n")

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
		Description: "System configuration settings",
		History:     5, // Keep up to 5 history records
	})
	if err != nil {
		log.Fatalf("Failed to create KV bucket settings_kv: %v", err)
	}

	// Put some initial keys
	keys := map[string]string{
		"theme":      "dark",
		"max_limit":  "100",
		"debug_mode": "true",
	}
	for k, v := range keys {
		if _, err := settingsKV.Put(ctx, k, []byte(v)); err != nil {
			log.Printf("Failed to put key %s: %v", k, err)
		}
	}

	// Modify one of the keys a few times to create history
	for i := 1; i <= 3; i++ {
		val := fmt.Sprintf("value_v%d", i)
		if _, err := settingsKV.Put(ctx, "dynamic_config", []byte(val)); err != nil {
			log.Printf("Failed to put dynamic_config history: %v", err)
		}
		time.Sleep(50 * time.Millisecond)
	}

	// Create user_profiles KV bucket
	profilesKV, err := js.CreateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket:      "user_profiles",
		Description: "User profile details",
	})
	if err != nil {
		log.Fatalf("Failed to create KV bucket user_profiles: %v", err)
	}

	profiles := map[string]string{
		"user.1001": `{"name":"Alice","role":"admin","email":"alice@example.com"}`,
		"user.1002": `{"name":"Bob","role":"user","email":"bob@example.com"}`,
	}
	for k, v := range profiles {
		if _, err := profilesKV.Put(ctx, k, []byte(v)); err != nil {
			log.Printf("Failed to put key %s: %v", k, err)
		}
	}
	log.Println("KV Buckets set up successfully!")
}

func setupObjectStore(ctx context.Context, js jetstream.JetStream) {
	log.Println("Setting up Object Store Buckets...")

	obs, err := js.CreateObjectStore(ctx, jetstream.ObjectStoreConfig{
		Bucket:      "documents_bucket",
		Description: "Repository for test documents",
	})
	if err != nil {
		log.Fatalf("Failed to create Object Store: %v", err)
	}

	// Put some objects
	files := []struct {
		name    string
		content string
	}{
		{"report.txt", "This is a simple textual report generated for NATS Object Store testing."},
		{"config.json", `{"environment": "production", "debug": false, "version": "1.0.4"}`},
		{"notes.md", "# Release Notes\n\n- Fix bugs\n- Add Object Store\n- Improve performance"},
	}

	for _, f := range files {
		_, err := obs.PutBytes(ctx, f.name, []byte(f.content))
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
		Description: "Stream tracking e-commerce orders",
	}
	stream, err := js.CreateStream(ctx, streamCfg)
	if err != nil {
		log.Fatalf("Failed to create stream ORDERS: %v", err)
	}

	// Create Stream SYSTEM_LOGS
	logStreamCfg := jetstream.StreamConfig{
		Name:        "SYSTEM_LOGS",
		Subjects:    []string{"logs.>"},
		Description: "Stream tracking system runtime logs",
	}
	_, err = js.CreateStream(ctx, logStreamCfg)
	if err != nil {
		log.Fatalf("Failed to create stream SYSTEM_LOGS: %v", err)
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
		Durable:     "processor_pull",
		Description: "Durable pull consumer for orders processing",
	}
	_, err = stream.CreateOrUpdateConsumer(ctx, pullCfg)
	if err != nil {
		log.Printf("Failed to create Pull Consumer: %v", err)
	}

	// Create Push Consumer on ORDERS
	pushCfg := jetstream.ConsumerConfig{
		Durable:        "monitor_push",
		DeliverSubject: "orders.monitor.delivery",
		Description:    "Durable push consumer for monitoring orders",
	}
	_, err = stream.CreateOrUpdateConsumer(ctx, pushCfg)
	if err != nil {
		log.Printf("Failed to create Push Consumer: %v", err)
	}

	log.Println("JetStream Streams and Consumers set up successfully!")
}

func setupMicroservice(nc *nats.Conn) micro.Service {
	log.Println("Setting up Microservice...")
	srv, err := micro.AddService(nc, micro.Config{
		Name:        "order-service",
		Version:     "1.0.0",
		Description: "A mock microservice for processing and retrieving orders",
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
	}), micro.WithEndpointSubject("orders.service.create"))
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
	}), micro.WithEndpointSubject("orders.service.get"))
	if err != nil {
		log.Fatalf("Failed to add endpoint 'get': %v", err)
	}

	log.Println("Microservice order-service is registered and listening!")
	return srv
}

func runSimulators(nc *nats.Conn) func() {
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
		ticker := time.NewTicker(6 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				// Alternating requests
				var subject string
				var payload string
				if rand.Float32() < 0.5 {
					subject = "orders.service.create"
					payload = `{"user_id":"USR-456","items":["monitor"]}`
				} else {
					subject = "orders.service.get"
					payload = `{"order_id":"ORD-123456"}`
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

	return func() {
		close(done)
		if sub != nil {
			sub.Unsubscribe()
		}
		log.Println("Simulators stopped.")
	}
}
