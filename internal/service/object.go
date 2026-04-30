package service

import (
	"context"

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

func (s *ObjectService) GetStatus(ctx context.Context, client *internalnats.Client, bucket string) (jetstream.ObjectStoreStatus, error) {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return nil, err
	}
	return obs.Status(ctx)
}

func (s *ObjectService) ListObjects(ctx context.Context, client *internalnats.Client, bucket string) ([]interface{}, error) {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return nil, err
	}

	list, err := obs.List(ctx)
	if err != nil {
		if err == jetstream.ErrNoObjectsFound {
			return []interface{}{}, nil
		}
		return nil, err
	}

	var result []interface{}
	for _, obj := range list {
		result = append(result, obj)
	}
	return result, nil
}

func (s *ObjectService) DeleteObject(ctx context.Context, client *internalnats.Client, bucket string, key string) error {
	obs, err := client.JS.ObjectStore(ctx, bucket)
	if err != nil {
		return err
	}
	return obs.Delete(ctx, key)
}
