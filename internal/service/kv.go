package service

import (
	"context"
	"strings"

	internalnats "gnats/internal/nats"

	"github.com/nats-io/nats.go/jetstream"
)

type KVService struct{}

func NewKVService() *KVService {
	return &KVService{}
}

func (s *KVService) ListBuckets(ctx context.Context, client *internalnats.Client) ([]string, error) {
	names := client.JS.KeyValueStoreNames(ctx)
	var result []string
	for name := range names.Name() {
		result = append(result, name)
	}
	return result, nil
}

func (s *KVService) CreateBucket(ctx context.Context, client *internalnats.Client, cfg jetstream.KeyValueConfig) (jetstream.KeyValueStatus, error) {
	kv, err := client.JS.CreateKeyValue(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return kv.Status(ctx)
}

func (s *KVService) DeleteBucket(ctx context.Context, client *internalnats.Client, bucket string) error {
	return client.JS.DeleteKeyValue(ctx, bucket)
}

func (s *KVService) GetStatus(ctx context.Context, client *internalnats.Client, bucket string) (jetstream.KeyValueStatus, error) {
	kv, err := client.JS.KeyValue(ctx, bucket)
	if err != nil {
		return nil, err
	}
	return kv.Status(ctx)
}

func (s *KVService) ListKeys(ctx context.Context, client *internalnats.Client, bucket string, search string, offset, limit int) (interface{}, error) {
	kv, err := client.JS.KeyValue(ctx, bucket)
	if err != nil {
		return nil, err
	}

	keysLister, err := kv.ListKeys(ctx)
	if err != nil {
		if err == jetstream.ErrNoKeysFound {
			return map[string]interface{}{
				"keys":    []string{},
				"hasMore": false,
			}, nil
		}
		return nil, err
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

	return map[string]interface{}{
		"keys":    result,
		"hasMore": hasMore,
	}, nil
}

func (s *KVService) GetKey(ctx context.Context, client *internalnats.Client, bucket string, key string) (interface{}, error) {
	kv, err := client.JS.KeyValue(ctx, bucket)
	if err != nil {
		return nil, err
	}

	entry, err := kv.Get(ctx, key)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"key":   entry.Key(),
		"value": string(entry.Value()),
		"rev":   entry.Revision(),
	}, nil
}

func (s *KVService) PutKey(ctx context.Context, client *internalnats.Client, bucket string, key string, value string) error {
	kv, err := client.JS.KeyValue(ctx, bucket)
	if err != nil {
		return err
	}

	_, err = kv.Put(ctx, key, []byte(value))
	return err
}

func (s *KVService) DeleteKey(ctx context.Context, client *internalnats.Client, bucket string, key string) error {
	kv, err := client.JS.KeyValue(ctx, bucket)
	if err != nil {
		return err
	}

	return kv.Delete(ctx, key)
}
