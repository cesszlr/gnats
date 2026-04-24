package nats

import (
	"crypto/tls"
	"fmt"
	"sync"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// ConnectionConfig represents a NATS connection configuration
type ConnectionConfig struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	Token    string `json:"token,omitempty"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
	Status   string `json:"status"`

	// TLS Options
	Insecure bool   `json:"insecure"`
	CAFile   string `json:"ca_file,omitempty"`
	CertFile string `json:"cert_file,omitempty"`
	KeyFile  string `json:"key_file,omitempty"`

	// JetStream Options
	Domain string `json:"domain,omitempty"`
}

// Client holds a single NATS connection and its related stores
type Client struct {
	Config ConnectionConfig
	Conn   *nats.Conn
	JS     jetstream.JetStream
}

// Manager manages multiple NATS connections
type Manager struct {
	clients map[string]*Client
	mu      sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		clients: make(map[string]*Client),
	}
}

func (m *Manager) Connect(cfg ConnectionConfig) (*Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If already connected, return the client
	if client, ok := m.clients[cfg.ID]; ok {
		return client, nil
	}

	opts := []nats.Option{
		nats.Name("NATS Web UI"),
	}

	if cfg.Token != "" {
		opts = append(opts, nats.Token(cfg.Token))
	} else if cfg.User != "" && cfg.Password != "" {
		opts = append(opts, nats.UserInfo(cfg.User, cfg.Password))
	}

	if cfg.Insecure {
		opts = append(opts, nats.Secure(&tls.Config{InsecureSkipVerify: true}))
	}
	if cfg.CAFile != "" {
		opts = append(opts, nats.RootCAs(cfg.CAFile))
	}
	if cfg.CertFile != "" && cfg.KeyFile != "" {
		opts = append(opts, nats.ClientCert(cfg.CertFile, cfg.KeyFile))
	}

	nc, err := nats.Connect(cfg.URL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	var js jetstream.JetStream
	// err is already declared above

	if cfg.Domain != "" {
		js, err = jetstream.NewWithDomain(nc, cfg.Domain)
	} else {
		js, err = jetstream.New(nc)
	}

	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("failed to create jetstream: %w", err)
	}
	client := &Client{
		Config: cfg,
		Conn:   nc,
		JS:     js,
	}

	m.clients[cfg.ID] = client
	return client, nil
}

func (m *Manager) Disconnect(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	client, ok := m.clients[id]
	if !ok {
		return fmt.Errorf("client with ID %s not found", id)
	}

	client.Conn.Close()
	delete(m.clients, id)
	return nil
}

func (m *Manager) GetClient(id string) (*Client, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	client, ok := m.clients[id]
	if !ok {
		return nil, fmt.Errorf("client with ID %s not found", id)
	}
	return client, nil
}

func (m *Manager) ListClients() []ConnectionConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	configs := make([]ConnectionConfig, 0, len(m.clients))
	for _, client := range m.clients {
		cfg := client.Config
		cfg.Status = client.Conn.Status().String()
		configs = append(configs, cfg)
	}
	return configs
}
