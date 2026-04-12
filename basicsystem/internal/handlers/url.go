package handlers

import (
	"net/http"

	db "github.com/baramsivaramireddy/url_shorter/basicsystem/internal/db"
	"github.com/gin-gonic/gin"
)

type URLRequest struct {
	OriginalURL string `json:"original_url" binding:"required"`
}

type URLResponse struct {
	ShortenedURL string `json:"shortened_url"`
}

func ShortenURL(c *gin.Context) {

	// read from request body
	// validate the URL
	// call the service to shorten the URL
	// return the shortened URL in response

	var req URLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	shortenedURL, err := db.UrlService.ShortenURL(req.OriginalURL)

	db.LogsService.LogWrite(req.OriginalURL, shortenedURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"shortened_url": shortenedURL})
}

func RedirectURL(c *gin.Context) {

	// read short URL from path parameter
	// call the service to get the original URL
	// redirect to the original URL

	ShortCode := c.Param("shortURL")
	originalURL, found := db.UrlService.GetOriginalURL(ShortCode)

	db.LogsService.LogRead(ShortCode, originalURL)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Short URL not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"original_url": originalURL})

}

func Analatics(c *gin.Context) {

	// return the analytics data for the shortened URLs
	// and writelogs too

	// return a html page and display the analytics data in a table format
	// call this api every 30 secs to get the latest analytics data and update the table

	analytics := db.LogsService.AnalyzeLogs()
	writeLogs := db.LogsService.WriteLogs()

	c.HTML(http.StatusOK, "analytics.html", gin.H{
		"analytics": analytics,
		"writeLogs": writeLogs,
	})

}
