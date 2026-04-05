package services

import (
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

	domain := "http://localhost:8080/"
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
