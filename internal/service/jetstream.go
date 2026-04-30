package service

import (
	"context"
	"sort"
	"time"

	internalnats "gnats/internal/nats"

	"github.com/nats-io/nats.go/jetstream"
)

type JetStreamService struct{}

func NewJetStreamService() *JetStreamService {
	return &JetStreamService{}
}

func (s *JetStreamService) ListStreams(ctx context.Context, client *internalnats.Client) ([]interface{}, error) {
	streams := client.JS.ListStreams(ctx)
	var result []interface{}
	for stream := range streams.Info() {
		result = append(result, stream)
	}
	if err := streams.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *JetStreamService) CreateStream(ctx context.Context, client *internalnats.Client, cfg jetstream.StreamConfig) (*jetstream.StreamInfo, error) {
	stream, err := client.JS.CreateStream(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return stream.CachedInfo(), nil
}

func (s *JetStreamService) DeleteStream(ctx context.Context, client *internalnats.Client, name string) error {
	return client.JS.DeleteStream(ctx, name)
}

func (s *JetStreamService) PurgeStream(ctx context.Context, client *internalnats.Client, name string) error {
	stream, err := client.JS.Stream(ctx, name)
	if err != nil {
		return err
	}
	return stream.Purge(ctx)
}

func (s *JetStreamService) ListConsumers(ctx context.Context, client *internalnats.Client, streamName string) ([]interface{}, error) {
	stream, err := client.JS.Stream(ctx, streamName)
	if err != nil {
		return nil, err
	}

	consumers := stream.ListConsumers(ctx)
	var result []interface{}
	for consumer := range consumers.Info() {
		result = append(result, consumer)
	}
	if err := consumers.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *JetStreamService) GetMessages(ctx context.Context, client *internalnats.Client, streamName string, limit int) ([]map[string]interface{}, error) {
	stream, err := client.JS.Stream(ctx, streamName)
	if err != nil {
		return nil, err
	}

	cfg := jetstream.ConsumerConfig{
		AckPolicy: jetstream.AckNonePolicy,
	}

	// Default to last messages
	cfg.DeliverPolicy = jetstream.DeliverLastPerSubjectPolicy
	if limit > 1 {
		cfg.DeliverPolicy = jetstream.DeliverLastPolicy
	}

	cons, err := stream.CreateOrUpdateConsumer(ctx, cfg)
	if err != nil {
		return nil, err
	}
	defer stream.DeleteConsumer(ctx, cons.CachedInfo().Name)

	msgs, err := cons.Fetch(limit, jetstream.FetchMaxWait(time.Second))
	if err != nil {
		return nil, err
	}

	var result []map[string]interface{}
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
		return result[i]["sequence"].(uint64) > result[j]["sequence"].(uint64)
	})

	return result, nil
}
