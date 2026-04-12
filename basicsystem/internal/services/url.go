package services

import (
	"time"

	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/models"
	gonanoid "github.com/matoous/go-nanoid/v2"
)

type URLService struct {
	urls []models.URL
}

func NewURLService() *URLService {
	return &URLService{
		urls: []models.URL{},
	}
}

func (s *URLService) ShortenURL(originalURL string) (string, error) {

	ShortCode := GenerateUniqueCode()

	// check if the generated short URL already exists, if yes generate a new one
	for s.checkURLExists(ShortCode) {
		ShortCode = GenerateUniqueCode()
	}

	url := models.URL{
		ID:          len(s.urls) + 1,
		OriginalURL: originalURL,
		ShortCode:   ShortCode,
	}
	s.urls = append(s.urls, url)

	domain := "http://localhost:8080/url/"
	return domain + url.ShortCode, nil
}

func (s *URLService) GetOriginalURL(ShortCode string) (string, bool) {
	for _, url := range s.urls {
		if url.ShortCode == ShortCode {
			return url.OriginalURL, true
		}
	}
	return "", false
}

func (s *URLService) checkURLExists(ShortCode string) bool {
	for _, url := range s.urls {
		if url.ShortCode == ShortCode {
			return true
		}
	}
	return false
}

func GenerateUniqueCode() string {
	// Logic to generate a short URL code

	// use nanoId to generate a unique short URL with 6 characters (total possible combinations: 64^6 = 68.7 billion)

	id, err := gonanoid.New(6)
	if err != nil {
		panic(err)
	}

	return id
}

type LogsService struct {
	readLogs  []models.ReadLog
	writeLogs []models.WriteLog
}

func NewLogsService() *LogsService {
	return &LogsService{
		readLogs:  []models.ReadLog{},
		writeLogs: []models.WriteLog{},
	}
}

func (s *LogsService) LogRead(originalURL string, shortCode string) {
	log := models.ReadLog{
		ID:          len(s.readLogs) + 1,
		OriginalURL: originalURL,
		ShortCode:   shortCode,
		AccessAt:    time.Now().Format(time.RFC3339),
	}
	s.readLogs = append(s.readLogs, log)
}

func (s *LogsService) LogWrite(originalURL, shortCode string) {
	log := models.WriteLog{
		ID:          len(s.writeLogs) + 1,
		OriginalURL: originalURL,
		ShortCode:   shortCode,
		CreatedAt:   time.Now().Format(time.RFC3339),
	}
	s.writeLogs = append(s.writeLogs, log)
}

func (s *LogsService) AnalyzeLogs() map[string]interface{} {
	// Logic to analyze logs and return insights
	// For example, we can count the number of times each short URL was accessed

	insights := make(map[string]interface{})
	urlAccessCount := make(map[string]int)

	for _, log := range s.readLogs {
		urlAccessCount[log.ShortCode]++
	}

	insights["url_access_count"] = urlAccessCount
	return insights
}

func (s *LogsService) WriteLogs() []models.WriteLog {
	return s.writeLogs
}
