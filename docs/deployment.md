# Running the URL shortener

## Docker Compose

Build and start the application:

```sh
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000). The React application and
API are served together. SQLite data is stored in the `shortener-data` named
volume, so links and analytics survive container restarts. `docker compose down`
does not remove this volume; `docker compose down -v` removes it and permanently
deletes the stored data.

Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `HOST_PORT` | `3000` | Host port mapped to the container |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Base URL included in newly created links |

For deployments behind a public hostname, set `PUBLIC_BASE_URL` to that
externally reachable origin before starting the service.

Check application readiness with `docker compose ps`; the container health check
uses `GET /health`.

## Local development

Install dependencies with `npm ci`, then run the API and frontend in separate
terminals:

```sh
npm start
npm run dev
```

The Vite development server proxies API requests to `http://localhost:3000`.
Run the production build with `npm run build`, and the automated API tests with
`npm test`.

## Performance checks

The link-pool generator and k6 baseline instructions are in
[testing/README.md](../testing/README.md).
