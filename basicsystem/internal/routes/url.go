package routes

import (
	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterURLRoutes(r *gin.Engine) {

	urlGroup := r.Group("/url")

	urlGroup.GET("/:shortURL", handlers.RedirectURL)
	urlGroup.POST("/", handlers.ShortenURL)
	urlGroup.GET("/", handlers.Analatics)

}
