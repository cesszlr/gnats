package service

import (
	"context"

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

func (s *JetStreamService) GetConsumer(ctx context.Context, client *internalnats.Client, streamName, consumerName string) (*jetstream.ConsumerInfo, error) {
	stream, err := client.JS.Stream(ctx, streamName)
	if err != nil {
		return nil, err
	}
	consumer, err := stream.Consumer(ctx, consumerName)
	if err != nil {
		if err == jetstream.ErrNotPullConsumer || err.Error() == "nats: consumer is not a pull consumer" {
			pushConsumer, pushErr := stream.PushConsumer(ctx, consumerName)
			if pushErr != nil {
				return nil, pushErr
			}
			return pushConsumer.Info(ctx)
		}
		return nil, err
	}
	return consumer.Info(ctx)
}

func (s *JetStreamService) CreateConsumer(ctx context.Context, client *internalnats.Client, streamName string, cfg jetstream.ConsumerConfig) (*jetstream.ConsumerInfo, error) {
	stream, err := client.JS.Stream(ctx, streamName)
	if err != nil {
		return nil, err
	}
	consumer, err := stream.CreateOrUpdateConsumer(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return consumer.Info(ctx)
}

func (s *JetStreamService) DeleteConsumer(ctx context.Context, client *internalnats.Client, streamName, consumerName string) error {
	stream, err := client.JS.Stream(ctx, streamName)
	if err != nil {
		return err
	}
	return stream.DeleteConsumer(ctx, consumerName)
}
