package service

import (
	"context"
	"strings"

	internalnats "gnats/internal/nats"

	"github.com/nats-io/nats.go/jetstream"
)

type ObjectService struct{}

func NewObjectService() *ObjectService {
	return &ObjectService{}
}

func (s *ObjectService) ListBuckets(ctx context.Context, client *internalnats.Client) ([]string, error) {
	names := client.JS.ObjectStoreNames(ctx)
	var result []string
	for name := range names.Name() {
		result = append(result, name)
	}
	return result, nil
}

func (s *ObjectService) CreateBucket(ctx context.Context, client *internalnats.Client, cfg jetstream.ObjectStoreConfig) (jetstream.ObjectStoreStatus, error) {
	obs, err := client.JS.CreateObjectStore(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return obs.Status(ctx)
}

func (s *ObjectService) DeleteBucket(ctx context.Context, client *internalnats.Client, bucket string) error {
	return client.JS.DeleteObjectStore(ctx, bucket)
}

func (s *ObjectService) GetStatus(ctx context.Context, client *internalnats.Client, bucket string) (interface{}, error) {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return nil, err
	}
	status, err := obs.Status(ctx)
	if err != nil {
		return nil, err
	}

	ttl := "None"
	if status.TTL() > 0 {
		ttl = status.TTL().String()
	}

	storage := "File"
	if status.Storage() == jetstream.MemoryStorage {
		storage = "Memory"
	}

	return map[string]interface{}{
		"bucket":        status.Bucket(),
		"description":   status.Description(),
		"ttl":           ttl,
		"storage":       storage,
		"backing_store": status.BackingStore(),
		"size":          status.Size(),
		"replicas":      status.Replicas(),
		"is_compressed": status.IsCompressed(),
		"sealed":        status.Sealed(),
		"metadata":      status.Metadata(),
	}, nil
}

func (s *ObjectService) GetObject(ctx context.Context, client *internalnats.Client, bucket string, key string) (jetstream.ObjectResult, error) {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return nil, err
	}
	return obs.Get(ctx, key)
}

func (s *ObjectService) ListObjects(ctx context.Context, client *internalnats.Client, bucket string, search string, offset, limit int) (interface{}, error) {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return nil, err
	}

	list, err := obs.List(ctx)
	if err != nil {
		if err == jetstream.ErrNoObjectsFound {
			return map[string]interface{}{
				"objects": []interface{}{},
				"hasMore": false,
			}, nil
		}
		return nil, err
	}

	var result []interface{}
	count := 0
	matchedCount := 0
	hasMore := false

	searchLower := strings.ToLower(search)

	for _, obj := range list {
		if search == "" || strings.Contains(strings.ToLower(obj.Name), searchLower) {
			if matchedCount >= offset && count < limit {
				result = append(result, obj)
				count++
			} else if matchedCount >= offset+limit {
				hasMore = true
				break
			}
			matchedCount++
		}
	}

	return map[string]interface{}{
		"objects": result,
		"hasMore": hasMore,
	}, nil
}

func (s *ObjectService) DeleteObject(ctx context.Context, client *internalnats.Client, bucket string, key string) error {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return err
	}
	return obs.Delete(ctx, key)
}
