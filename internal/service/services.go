package service

import (
	"context"
	"encoding/json"
	"time"

	internalnats "gnats/internal/nats"

	"github.com/nats-io/nats.go"
)

type ServicesService struct{}

func NewServicesService() *ServicesService {
	return &ServicesService{}
}

func (s *ServicesService) ListServices(ctx context.Context, client *internalnats.Client) ([]interface{}, error) {
	// Microservices discovery using PING
	sub, err := client.Conn.SubscribeSync(nats.NewInbox())
	if err != nil {
		return nil, err
	}
	defer sub.Unsubscribe()

	err = client.Conn.PublishRequest("$SRV.PING", sub.Subject, nil)
	if err != nil {
		return nil, err
	}

	var services []interface{}
	// Collect responses for 200ms
	endTime := time.Now().Add(200 * time.Millisecond)
	for time.Now().Before(endTime) {
		msg, err := sub.NextMsg(time.Until(endTime))
		if err != nil {
			break
		}
		var info interface{}
		if err := json.Unmarshal(msg.Data, &info); err == nil {
			services = append(services, info)
		}
	}

	return services, nil
}

func (s *ServicesService) Publish(client *internalnats.Client, subject, reply, data string, headers map[string]string) error {
	msg := &nats.Msg{
		Subject: subject,
		Reply:   reply,
		Data:    []byte(data),
		Header:  make(nats.Header),
	}
	for k, v := range headers {
		msg.Header.Set(k, v)
	}

	return client.Conn.PublishMsg(msg)
}
