package models

type URL struct {
	ID          int
	OriginalURL string
	ShortCode   string
}

type ReadLog struct {
	ID          int
	OriginalURL string
	ShortCode   string
	AccessAt    string
}

type WriteLog struct {
	ID          int
	OriginalURL string
	ShortCode   string
	CreatedAt   string
}
