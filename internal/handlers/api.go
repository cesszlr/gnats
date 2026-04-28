package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	internalnats "gnats/internal/nats"

	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

type API struct {
	manager *internalnats.Manager
}

func NewAPI(manager *internalnats.Manager) *API {
	return &API{
		manager: manager,
	}
}

func (a *API) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/connections", a.ListConnections)
	r.Post("/connections", a.Connect)
	r.Delete("/connections/{id}", a.Disconnect)
	r.Delete("/connections/{id}/forget", a.DeleteConnection)
	r.Post("/connections/{id}/publish", a.Publish)
	r.Get("/connections/{id}/streams", a.ListStreams)
	r.Post("/connections/{id}/streams", a.CreateStream)
	r.Delete("/connections/{id}/streams/{stream}", a.DeleteStream)
	r.Get("/connections/{id}/streams/{stream}/messages", a.GetStreamMessages)
	r.Post("/connections/{id}/streams/{stream}/purge", a.PurgeStream)
	r.Get("/connections/{id}/streams/{stream}/consumers", a.ListConsumers)
	r.Get("/connections/{id}/kv", a.ListKV)
	r.Post("/connections/{id}/kv", a.CreateKV)
	r.Delete("/connections/{id}/kv/{bucket}", a.DeleteKV)
	r.Get("/connections/{id}/kv/{bucket}/status", a.GetKVStatus)
	r.Get("/connections/{id}/kv/{bucket}/keys", a.ListKVKeys)
	r.Get("/connections/{id}/kv/{bucket}/keys/{key}", a.GetKVKey)
	r.Put("/connections/{id}/kv/{bucket}/keys/{key}", a.PutKVKey)
	r.Delete("/connections/{id}/kv/{bucket}/keys/{key}", a.DeleteKVKey)
	r.Get("/connections/{id}/object-store", a.ListObjectStores)
	r.Post("/connections/{id}/object-store", a.CreateObjectStore)
	r.Delete("/connections/{id}/object-store/{bucket}", a.DeleteObjectStore)
	r.Get("/connections/{id}/object-store/{bucket}/status", a.GetObjectStoreStatus)
	r.Get("/connections/{id}/object-store/{bucket}/objects", a.ListObjects)
	r.Delete("/connections/{id}/object-store/{bucket}/objects/{key}", a.DeleteObject)
	r.Get("/connections/{id}/services", a.ListServices)
	r.Get("/connections/{id}/stats", a.GetStats)

	return r
}

func (a *API) ListConnections(w http.ResponseWriter, r *http.Request) {
	connections := a.manager.ListClients()
	json.NewEncoder(w).Encode(connections)
}

func (a *API) Connect(w http.ResponseWriter, r *http.Request) {
	var cfg internalnats.ConnectionConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if cfg.ID == "" {
		http.Error(w, "ID is required", http.StatusBadRequest)
		return
	}

	client, err := a.manager.Connect(cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	res := client.Config
	res.Status = client.Conn.Status().String()
	json.NewEncoder(w).Encode(res)
}

func (a *API) Disconnect(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.manager.Disconnect(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.manager.DeleteConfig(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) Publish(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Subject string            `json:"subject"`
		Data    string            `json:"data"`
		Reply   string            `json:"reply"`
		Headers map[string]string `json:"headers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	msg := &nats.Msg{
		Subject: req.Subject,
		Reply:   req.Reply,
		Data:    []byte(req.Data),
		Header:  make(nats.Header),
	}
	for k, v := range req.Headers {
		msg.Header.Set(k, v)
	}

	if err := client.Conn.PublishMsg(msg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
}

func (a *API) ListStreams(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	streams := client.JS.ListStreams(r.Context())
	var result []interface{}
	for stream := range streams.Info() {
		result = append(result, stream)
	}
	if err := streams.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(result)
}

func (a *API) CreateStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var cfg jetstream.StreamConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	stream, err := client.JS.CreateStream(r.Context(), cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(stream.CachedInfo())
}

func (a *API) DeleteStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	streamName := chi.URLParam(r, "stream")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if err := client.JS.DeleteStream(r.Context(), streamName); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ListConsumers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	streamName := chi.URLParam(r, "stream")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	stream, err := client.JS.Stream(r.Context(), streamName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	consumers := stream.ListConsumers(r.Context())
	var result []interface{}
	for consumer := range consumers.Info() {
		result = append(result, consumer)
	}
	if err := consumers.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(result)
}

func (a *API) GetKVStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.KeyValue(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	status, err := kv.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(status)
}

func (a *API) ListKV(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	names := client.JS.KeyValueStoreNames(r.Context())
	var result []string
	for name := range names.Name() {
		result = append(result, name)
	}
	json.NewEncoder(w).Encode(result)
}

func (a *API) CreateKV(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var cfg jetstream.KeyValueConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.CreateKeyValue(r.Context(), cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	status, err := kv.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(status)
}

func (a *API) DeleteKV(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if err := client.JS.DeleteKeyValue(r.Context(), bucket); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ListKVKeys(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")
	search := r.URL.Query().Get("search")

	offsetStr := r.URL.Query().Get("offset")
	limitStr := r.URL.Query().Get("limit")

	offset := 0
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.KeyValue(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	keysLister, err := kv.ListKeys(r.Context())
	if err != nil {
		if err == jetstream.ErrNoKeysFound {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"keys":    []string{},
				"hasMore": false,
			})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var result []string
	count := 0
	matchedCount := 0
	hasMore := false

	searchLower := strings.ToLower(search)

	for key := range keysLister.Keys() {
		if search == "" || strings.Contains(strings.ToLower(key), searchLower) {
			if matchedCount >= offset && count < limit {
				result = append(result, key)
				count++
			} else if matchedCount >= offset+limit {
				hasMore = true
				break
			}
			matchedCount++
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"keys":    result,
		"hasMore": hasMore,
	})
}

func (a *API) PutKVKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")

	var req struct {
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.KeyValue(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = kv.Put(r.Context(), key, []byte(req.Value))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
}

func (a *API) DeleteKVKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.KeyValue(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := kv.Delete(r.Context(), key); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ListObjectStores(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	names := client.JS.ObjectStoreNames(r.Context())
	var result []string
	for name := range names.Name() {
		result = append(result, name)
	}
	json.NewEncoder(w).Encode(result)
}

func (a *API) CreateObjectStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var cfg jetstream.ObjectStoreConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	obs, err := client.JS.CreateObjectStore(r.Context(), cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	status, err := obs.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(status)
}

func (a *API) DeleteObjectStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if err := client.JS.DeleteObjectStore(r.Context(), bucket); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) GetObjectStoreStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	obs, err := client.JS.ObjectStore(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	status, err := obs.Status(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(status)
}

func (a *API) ListObjects(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	obs, err := client.JS.ObjectStore(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	list, err := obs.List(r.Context())
	if err != nil {
		if err == jetstream.ErrNoObjectsFound {
			json.NewEncoder(w).Encode([]interface{}{})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(list)
}

func (a *API) DeleteObject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	obs, err := client.JS.ObjectStore(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := obs.Delete(r.Context(), key); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) ListServices(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Microservices discovery using PING
	// Services respond to $SRV.PING
	sub, err := client.Conn.SubscribeSync(nats.NewInbox())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer sub.Unsubscribe()

	err = client.Conn.PublishRequest("$SRV.PING", sub.Subject, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var services []interface{}
	for {
		msg, err := sub.NextMsg(200 * time.Millisecond)
		if err != nil {
			break
		}
		var info interface{}
		if err := json.Unmarshal(msg.Data, &info); err == nil {
			services = append(services, info)
		}
	}

	json.NewEncoder(w).Encode(services)
}

func (a *API) GetStreamMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	streamName := chi.URLParam(r, "stream")

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	stream, err := client.JS.Stream(r.Context(), streamName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	cfg := jetstream.ConsumerConfig{
		AckPolicy: jetstream.AckNonePolicy,
	}

	// Default to last messages
	cfg.DeliverPolicy = jetstream.DeliverLastPerSubjectPolicy
	if limit > 1 {
		cfg.DeliverPolicy = jetstream.DeliverLastPolicy
	}

	cons, err := stream.CreateOrUpdateConsumer(r.Context(), cfg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer stream.DeleteConsumer(r.Context(), cons.CachedInfo().Name)

	msgs, err := cons.Fetch(limit, jetstream.FetchMaxWait(time.Second))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var result []interface{}
	for msg := range msgs.Messages() {
		meta, _ := msg.Metadata()
		result = append(result, map[string]interface{}{
			"subject":  msg.Subject(),
			"data":     string(msg.Data()),
			"sequence": meta.Sequence.Stream,
			"time":     meta.Timestamp,
		})
	}

	// Sort by sequence descending to show newest first
	sort.Slice(result, func(i, j int) bool {
		return result[i].(map[string]interface{})["sequence"].(uint64) > result[j].(map[string]interface{})["sequence"].(uint64)
	})

	json.NewEncoder(w).Encode(result)
}

func (a *API) PurgeStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	streamName := chi.URLParam(r, "stream")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	stream, err := client.JS.Stream(r.Context(), streamName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := stream.Purge(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *API) GetKVKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	bucket := chi.URLParam(r, "bucket")
	key := chi.URLParam(r, "key")

	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	kv, err := client.JS.KeyValue(r.Context(), bucket)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	entry, err := kv.Get(r.Context(), key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":   entry.Key(),
		"value": string(entry.Value()),
		"rev":   entry.Revision(),
	})
}

func (a *API) GetStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := a.manager.GetClient(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	stats := map[string]interface{}{
		"server_info": client.Conn.ConnectedAddr(),
		"rtt":         0,
	}

	rtt, _ := client.Conn.RTT()
	stats["rtt"] = rtt.String()

	// JetStream stats
	jsInfo, err := client.JS.AccountInfo(r.Context())
	if err == nil {
		stats["jetstream"] = jsInfo
	}

	json.NewEncoder(w).Encode(stats)
}
