package main

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/db"
	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/routes"
)

func main() {
	fmt.Println("Starting URL Shortener Service...")
	db.SetUpDB()

	r := gin.Default()
	routes.RegisterURLRoutes(r)
	r.Run(":8080")
}
