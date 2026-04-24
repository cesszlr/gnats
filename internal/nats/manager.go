package nats

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func getConfigPath() string {
	if path := os.Getenv("CONNECTIONS_FILE"); path != "" {
		return path
	}
	return "connections.json"
}

// ConnectionConfig represents a NATS connection configuration
type ConnectionConfig struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	Token    string `json:"token,omitempty"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
	Status   string `json:"status"`

	// TLS Options (File Paths)
	Insecure bool   `json:"insecure"`
	CAFile   string `json:"ca_file,omitempty"`
	CertFile string `json:"cert_file,omitempty"`
	KeyFile  string `json:"key_file,omitempty"`

	// TLS Options (PEM Content)
	CAContent   string `json:"ca_content,omitempty"`
	CertContent string `json:"cert_content,omitempty"`
	KeyContent  string `json:"key_content,omitempty"`

	// JetStream Options
	Domain string `json:"domain,omitempty"`
}

// Client holds a single NATS connection and its related stores
type Client struct {
	Config ConnectionConfig
	Conn   *nats.Conn
	JS     jetstream.JetStream
}

// Manager manages multiple NATS connections with persistence
type Manager struct {
	configs map[string]ConnectionConfig
	clients map[string]*Client
	mu      sync.RWMutex
}

func NewManager() *Manager {
	m := &Manager{
		configs: make(map[string]ConnectionConfig),
		clients: make(map[string]*Client),
	}
	m.loadConfigs()
	return m
}

func (m *Manager) loadConfigs() {
	data, err := os.ReadFile(getConfigPath())
	if err != nil {
		return
	}
	var configs []ConnectionConfig
	if err := json.Unmarshal(data, &configs); err == nil {
		for _, cfg := range configs {
			cfg.Status = "DISCONNECTED"
			m.configs[cfg.ID] = cfg
		}
	}
}

func (m *Manager) saveConfigs() {
	var configs []ConnectionConfig
	for _, cfg := range m.configs {
		// Don't save transient status
		cfg.Status = ""
		configs = append(configs, cfg)
	}
	data, _ := json.MarshalIndent(configs, "", "  ")
	_ = os.WriteFile(getConfigPath(), data, 0644)
}

func (m *Manager) Connect(cfg ConnectionConfig) (*Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If already connected, close it first to refresh settings
	if client, ok := m.clients[cfg.ID]; ok {
		client.Conn.Close()
		delete(m.clients, cfg.ID)
	}

	opts := []nats.Option{
		nats.Name("NATS Web UI"),
	}

	if cfg.Token != "" {
		opts = append(opts, nats.Token(cfg.Token))
	} else if cfg.User != "" && cfg.Password != "" {
		opts = append(opts, nats.UserInfo(cfg.User, cfg.Password))
	}

	// TLS Setup
	tlsConfig := &tls.Config{
		InsecureSkipVerify: cfg.Insecure,
	}

	// Handle CA (File or Content)
	if cfg.CAContent != "" || cfg.CAFile != "" {
		pool := x509.NewCertPool()
		var caBytes []byte
		var err error

		if cfg.CAContent != "" {
			caBytes = []byte(cfg.CAContent)
		} else {
			caBytes, err = os.ReadFile(cfg.CAFile)
		}

		if err == nil {
			if ok := pool.AppendCertsFromPEM(caBytes); ok {
				tlsConfig.RootCAs = pool
			}
		}
	}

	// Handle Client Cert/Key (File or Content)
	hasCert := cfg.CertContent != "" || cfg.CertFile != ""
	hasKey := cfg.KeyContent != "" || cfg.KeyFile != ""

	if hasCert && hasKey {
		var cert tls.Certificate
		var err error

		if cfg.CertContent != "" && cfg.KeyContent != "" {
			cert, err = tls.X509KeyPair([]byte(cfg.CertContent), []byte(cfg.KeyContent))
		} else if cfg.CertFile != "" && cfg.KeyFile != "" {
			cert, err = tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
		}

		if err == nil {
			tlsConfig.Certificates = []tls.Certificate{cert}
		} else {
			return nil, fmt.Errorf("failed to load client certificate: %w", err)
		}
	}

	// Always apply Secure if any TLS option is used or insecure is toggled
	opts = append(opts, nats.Secure(tlsConfig))

	nc, err := nats.Connect(cfg.URL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %w", err)
	}

	var js jetstream.JetStream
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
	m.configs[cfg.ID] = cfg
	m.saveConfigs()

	return client, nil
}

func (m *Manager) Disconnect(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	client, ok := m.clients[id]
	if ok {
		client.Conn.Close()
		delete(m.clients, id)
	}
	return nil
}

func (m *Manager) DeleteConfig(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Close client if active
	if client, ok := m.clients[id]; ok {
		client.Conn.Close()
		delete(m.clients, id)
	}

	delete(m.configs, id)
	m.saveConfigs()

	return nil
}

func (m *Manager) GetClient(id string) (*Client, error) {
	m.mu.RLock()
	// Check if already active
	if client, ok := m.clients[id]; ok {
		m.mu.RUnlock()
		return client, nil
	}

	// If not active, try to auto-connect using saved config
	cfg, ok := m.configs[id]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("connection with ID %s not found", id)
	}

	// Re-connect
	return m.Connect(cfg)
}

func (m *Manager) ListClients() []ConnectionConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]ConnectionConfig, 0, len(m.configs))
	for _, cfg := range m.configs {
		if client, ok := m.clients[cfg.ID]; ok {
			cfg.Status = client.Conn.Status().String()
		} else {
			cfg.Status = "DISCONNECTED"
		}
		result = append(result, cfg)
	}
	return result
}
