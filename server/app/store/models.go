package store

import "encoding/json"

type User struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	Password  string `json:"-"`
}

type Course struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Author      string  `json:"author"`
	Level       string  `json:"level"`
	Lessons     int     `json:"lessons"`
	Duration    string  `json:"duration"`
	Price       int     `json:"price"`
	Rating      float64 `json:"rating"`
	Students    int     `json:"students"`
	Hue         int     `json:"hue"`
	Description string  `json:"description"`
	Disclaimer  string  `json:"disclaimer"`
}

type LiveSession struct {
	ID     int64  `json:"id"`
	Day    int    `json:"day"`
	Month  string `json:"month"`
	Title  string `json:"title"`
	Author string `json:"author"`
	Time   string `json:"time"`
	Length string `json:"length"`
	Seats  int    `json:"seats"`
	Kind   string `json:"kind"`
	IsLive bool   `json:"is_live"`
}

type Indicator struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Category    string          `json:"category"`
	Platform    string          `json:"platform"`
	Description string          `json:"description"`
	Price       int             `json:"price"`
	Rating      float64         `json:"rating"`
	Subs        int             `json:"subs"`
	Kind        string          `json:"kind"`
	Number      int             `json:"number"`
	Version     string          `json:"version"`
	Inputs      json.RawMessage `json:"inputs"`
	Plots       json.RawMessage `json:"plots"`
	Window      string          `json:"window"`
	PairID      string          `json:"pair_strategy_id"`
	SizeKB      int             `json:"size_kb"`
}

type Strategy struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Symbol      string          `json:"symbol"`
	Timeframe   string          `json:"timeframe"`
	Style       string          `json:"style"`
	Risk        string          `json:"risk"`
	Return      float64         `json:"return_12m"`
	Drawdown    float64         `json:"max_drawdown"`
	WinRate     int             `json:"win_rate"`
	PF          float64         `json:"profit_factor"`
	Trades      int             `json:"trades"`
	MinCapital  int             `json:"min_capital"`
	Price       int             `json:"price"`
	Subs        int             `json:"subs"`
	Seed        int             `json:"seed"`
	Author      string          `json:"author"`
	Description string          `json:"description"`
	Number      int             `json:"number"`
	Version     string          `json:"version"`
	Category    string          `json:"category"`
	Inputs      json.RawMessage `json:"inputs"`
	PairID      string          `json:"pair_indicator_id"`
	Timeframes  string          `json:"timeframes"`
	SizeKB      int             `json:"size_kb"`
}

type Lesson struct {
	ID          int64  `json:"id"`
	CourseID    string `json:"course_id"`
	Idx         int    `json:"idx"`
	Title       string `json:"title"`
	Duration    string `json:"duration"`
	VideoURL    string `json:"video_url"`
	FreePreview bool   `json:"free_preview"`
	Module      string `json:"module"`
	Summary     string `json:"summary"`
	ResourceURL string `json:"resource_url"`
	Locked      bool   `json:"locked"`
	Done        bool   `json:"done"`
}

type Script struct {
	ID           string          `json:"id"`
	Title        string          `json:"title"`
	Category     string          `json:"category"`
	Status       string          `json:"status"`
	Price        int             `json:"price"`
	Version      string          `json:"version"`
	Description  string          `json:"description"`
	Requirements string          `json:"requirements"`
	Tags         json.RawMessage `json:"tags"`
}

type Broker struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	Regulation string `json:"regulation"`
	Spread     string `json:"spread"`
	MinDeposit string `json:"min_deposit"`
}

type Plan struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Price int    `json:"price"`
}

type Mentor struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Initials string `json:"initials"`
}

type Subscription struct {
	ID     int64  `json:"id"`
	Kind   string `json:"kind"`
	ItemID string `json:"item_id"`
	Title  string `json:"title"`
	Plan   string `json:"plan"`
	Price  int    `json:"price"`
	Since  string `json:"since"`
}

type Enrollment struct {
	Course   Course `json:"course"`
	Progress int    `json:"progress"`
	Since    string `json:"since"`
}

type Booking struct {
	ID          int64  `json:"id"`
	MentorID    string `json:"mentor_id"`
	ScheduledAt string `json:"scheduled_at"`
	What        string `json:"what"`
	Note        string `json:"note"`
	CreatedAt   string `json:"created_at"`
}

type Order struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	ItemID     string `json:"item_id"`
	Item       string `json:"item"`
	Amount     int    `json:"amount"`
	Period     string `json:"period"`
	Status     string `json:"status"`
	PaymentRef string `json:"payment_ref"`
	CreatedAt  string `json:"created_at"`
}

type Ticket struct {
	ID        int64  `json:"id"`
	Subject   string `json:"subject"`
	Body      string `json:"body"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

type BrokerAccount struct {
	BrokerID    string  `json:"broker_id"`
	MT5Login    string  `json:"mt5_login"`
	MT5Server   string  `json:"mt5_server"`
	BridgeToken string  `json:"bridge_token,omitempty"`
	Status      string  `json:"status"`
	Equity      float64 `json:"equity"`
	Balance     float64 `json:"balance"`
	LastSeen    string  `json:"last_seen"`
}

type StrategyRun struct {
	Strategy Strategy `json:"strategy"`
	Running  bool     `json:"running"`
	LotSize  float64  `json:"lot_size"`
	MonthPnL float64  `json:"month_pnl"`
	Trades   int      `json:"trades_today"`
}

type Position struct {
	Ticket       string  `json:"ticket"`
	Symbol       string  `json:"symbol"`
	Side         string  `json:"side"`
	Lots         float64 `json:"lots"`
	OpenPrice    float64 `json:"open_price"`
	CurrentPrice float64 `json:"current_price"`
	PnL          float64 `json:"pnl"`
	StrategyID   string  `json:"strategy_id"`
	OpenedAt     string  `json:"opened_at"`
}

type TradeOrder struct {
	Ticket     string  `json:"ticket"`
	PlacedAt   string  `json:"placed_at"`
	Symbol     string  `json:"symbol"`
	Side       string  `json:"side"`
	Type       string  `json:"type"`
	Lots       float64 `json:"lots"`
	Price      float64 `json:"price"`
	Status     string  `json:"status"`
	StrategyID string  `json:"strategy_id"`
}

type Trade struct {
	Ticket     string  `json:"ticket"`
	Symbol     string  `json:"symbol"`
	Side       string  `json:"side"`
	Lots       float64 `json:"lots"`
	OpenPrice  float64 `json:"open_price"`
	ClosePrice float64 `json:"close_price"`
	PnL        float64 `json:"pnl"`
	StrategyID string  `json:"strategy_id"`
	ClosedAt   string  `json:"closed_at"`
}

type DailyPnL struct {
	Day string  `json:"day"`
	PnL float64 `json:"pnl"`
}

type Activity struct {
	ID   int64  `json:"id"`
	Tag  string `json:"tag"`
	Text string `json:"text"`
	At   string `json:"at"`
}

// PositionPnL mirrors the frontend's contract multipliers.
func PositionPnL(p Position) float64 {
	mult := 100000.0
	switch p.Symbol {
	case "XAUUSD":
		mult = 100
	case "NAS100":
		mult = 10
	case "USDJPY":
		mult = 1000 / 1.495
	}
	dir := 1.0
	if p.Side == "sell" {
		dir = -1
	}
	return dir * (p.CurrentPrice - p.OpenPrice) * p.Lots * mult
}
