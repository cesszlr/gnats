package nats

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

func getConfigPath() string {
	path := os.Getenv("CONNECTIONS_FILE")
	if path == "" {
		path = "connections.json"
	}

	// If the file exists, use it directly
	if _, err := os.Stat(path); err == nil {
		return path
	}

	// If not found and it's a relative path, try finding it relative to project root (e.g. if run from cmd/gnats)
	if !filepath.IsAbs(path) {
		altPath := filepath.Join("../..", path)
		if _, err := os.Stat(altPath); err == nil {
			return altPath
		}
	}

	return path
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

	// Monitoring
	MonitoringURL string `json:"monitoring_url,omitempty"`
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
	for id, cfg := range m.configs {
		// Ensure ID matches key and clear transient status
		cfg.ID = id
		cfg.Status = ""
		configs = append(configs, cfg)
	}
	data, _ := json.MarshalIndent(configs, "", "  ")
	_ = os.WriteFile(getConfigPath(), data, 0644)
}

func buildTLSConfig(cfg ConnectionConfig) (*tls.Config, error) {
	useTLS := cfg.Insecure || cfg.CAContent != "" || cfg.CAFile != "" ||
		cfg.CertContent != "" || cfg.CertFile != "" ||
		strings.HasPrefix(cfg.URL, "tls://")

	if !useTLS {
		return nil, nil
	}

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

	return tlsConfig, nil
}

func (m *Manager) Connect(cfg ConnectionConfig) (*Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Disconnect ALL other clients first (Single Active Connection Rule)
	for id, client := range m.clients {
		if id != cfg.ID {
			client.Conn.Close()
			delete(m.clients, id)
		}
	}

	// If the current one is already connected, close it first to refresh settings
	if client, ok := m.clients[cfg.ID]; ok {
		client.Conn.Close()
		delete(m.clients, cfg.ID)
	}

	opts := []nats.Option{
		nats.Name("GNATS"),
	}

	if cfg.Token != "" {
		opts = append(opts, nats.Token(cfg.Token))
	} else if cfg.User != "" && cfg.Password != "" {
		opts = append(opts, nats.UserInfo(cfg.User, cfg.Password))
	}

	// TLS Setup
	tlsConfig, err := buildTLSConfig(cfg)
	if err != nil {
		return nil, err
	}
	if tlsConfig != nil {
		opts = append(opts, nats.Secure(tlsConfig))
	}

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

func (m *Manager) EnsureClient(id string) (*Client, error) {
	m.mu.RLock()
	// Check if already active and still connected
	if client, ok := m.clients[id]; ok {
		status := client.Conn.Status()
		if status == nats.CONNECTED || status == nats.RECONNECTING || status == nats.CONNECTING {
			m.mu.RUnlock()
			return client, nil
		}
	}

	// If not active or disconnected, try to auto-connect using saved config
	cfg, ok := m.configs[id]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("connection with ID %s not found", id)
	}

	// Re-connect
	return m.Connect(cfg)
}

func (m *Manager) GetActiveClient(id string) (*Client, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, ok := m.clients[id]
	return client, ok
}

func (m *Manager) UpdateConfig(cfg ConnectionConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If already connected, we might want to close it to apply changes later,
	// but for "UpdateConfig" specifically, we just update the stored config.
	// If the user wants to reconnect, they can do so separately.
	m.configs[cfg.ID] = cfg
	m.saveConfigs()
}

func (m *Manager) ListClients() []ConnectionConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]ConnectionConfig, 0, len(m.configs))
	for id, cfg := range m.configs {
		// Ensure the ID in the struct matches the map key
		cfg.ID = id

		if client, ok := m.clients[id]; ok {
			status := strings.ToUpper(client.Conn.Status().String())
			cfg.Status = status
		} else {
			cfg.Status = "DISCONNECTED"
		}
		result = append(result, cfg)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	return result
}
