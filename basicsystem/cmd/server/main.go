package main

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"os"

	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/db"
	"github.com/baramsivaramireddy/url_shorter/basicsystem/internal/routes"
)

// ... inside main

func main() {
	fmt.Println("Starting URL Shortener Service...")
	db.SetUpDB()

	cwd, _ := os.Getwd()
	fmt.Println("Current working directory:", cwd)
	r := gin.Default()
	r.LoadHTMLGlob("internal/templates/*.html")

	routes.RegisterURLRoutes(r)
	r.Run(":8080")
}
