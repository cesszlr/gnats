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

func (s *ServicesService) Request(client *internalnats.Client, subject, data string, headers map[string]string, timeout time.Duration) (*nats.Msg, time.Duration, error) {
	msg := &nats.Msg{
		Subject: subject,
		Data:    []byte(data),
		Header:  make(nats.Header),
	}
	for k, v := range headers {
		msg.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := client.Conn.RequestMsg(msg, timeout)
	duration := time.Since(start)
	return resp, duration, err
}

func (s *ServicesService) RequestWithContext(ctx context.Context, client *internalnats.Client, subject, reply, data string, headers map[string]string, timeout time.Duration) (*nats.Msg, time.Duration, error) {
	msg := &nats.Msg{
		Subject: subject,
		Data:    []byte(data),
		Header:  make(nats.Header),
	}
	for k, v := range headers {
		msg.Header.Set(k, v)
	}

	start := time.Now()

	// 1. No custom reply subject, use built-in multiplexed request
	if reply == "" {
		resp, err := client.Conn.RequestMsgWithContext(ctx, msg)
		duration := time.Since(start)
		return resp, duration, err
	}

	// 2. Custom reply subject
	sub, err := client.Conn.SubscribeSync(reply)
	if err != nil {
		return nil, 0, err
	}
	defer sub.Unsubscribe()

	msg.Reply = reply
	if err := client.Conn.PublishMsg(msg); err != nil {
		return nil, 0, err
	}

	// Wait for response or Context Cancellation/Timeout
	msgChan := make(chan *nats.Msg, 1)
	errChan := make(chan error, 1)

	go func() {
		m, e := sub.NextMsg(timeout)
		if e != nil {
			errChan <- e
		} else {
			msgChan <- m
		}
	}()

	select {
	case <-ctx.Done():
		return nil, time.Since(start), ctx.Err()
	case e := <-errChan:
		return nil, time.Since(start), e
	case m := <-msgChan:
		return m, time.Since(start), nil
	}
}
