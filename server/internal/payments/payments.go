// Package payments abstracts the card charge so Stripe/Razorpay can be dropped in later.
package payments

import (
	"context"
	"fmt"
	"time"
)

type Provider interface {
	// Charge bills amountUSD to the user and returns a provider reference.
	Charge(ctx context.Context, userID int64, amountUSD int, description string) (string, error)
}

// Demo approves every charge without moving money.
type Demo struct{}

func (Demo) Charge(_ context.Context, userID int64, amountUSD int, _ string) (string, error) {
	return fmt.Sprintf("demo_%d_%d_%d", userID, amountUSD, time.Now().UnixNano()), nil
}
