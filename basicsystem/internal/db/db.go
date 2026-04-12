package db

// This file is for setting up the in memory database for the URL shortener service.
// We can use a simple map to store the original URLs and their corresponding shortened URLs.
import (
	services "github.com/baramsivaramireddy/url_shorter/basicsystem/internal/services"
)

var UrlService *services.URLService

var LogsService *services.LogsService

func SetUpDB() {

	// Initialize the in-memory database

	// For simplicity, we can use a map to store the original URLs and their corresponding shortened URLs.

	UrlService = services.NewURLService()
	LogsService = services.NewLogsService()
}
