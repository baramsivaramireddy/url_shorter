import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./styles.css";

function dateInputValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function graphRange(fromDay, toDay) {
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function App() {
  const today = new Date();
  const [destination, setDestination] = useState("");
  const [createdLink, setCreatedLink] = useState(null);
  const [createError, setCreateError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [fromDay, setFromDay] = useState(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6);
    return dateInputValue(date);
  });
  const [toDay, setToDay] = useState(() => dateInputValue(today));
  const [span, setSpan] = useState("1h");
  const [shortCode, setShortCode] = useState("");
  const [graph, setGraph] = useState(null);
  const [graphError, setGraphError] = useState("");
  const [isLoadingGraph, setIsLoadingGraph] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const graphPoints = useMemo(() => {
    if (!graph) return [];
    const creates = new Map(
      graph.series.find((item) => item.type === "create").points.map((point) => [
        point.timestamp,
        point.count,
      ]),
    );
    const clicks = new Map(
      graph.series.find((item) => item.type === "click").points.map((point) => [
        point.timestamp,
        point.count,
      ]),
    );
    return graph.series[0].points.map((point) => ({
      timestamp: point.timestamp,
      creates: creates.get(point.timestamp) ?? 0,
      clicks: clicks.get(point.timestamp) ?? 0,
    }));
  }, [graph]);

  const totals = useMemo(
    () =>
      graphPoints.reduce(
        (sum, point) => ({
          creates: sum.creates + point.creates,
          clicks: sum.clicks + point.clicks,
        }),
        { creates: 0, clicks: 0 },
      ),
    [graphPoints],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadGraph() {
      if (fromDay > toDay) {
        setGraphError("The start date must be on or before the end date.");
        setIsLoadingGraph(false);
        return;
      }

      setIsLoadingGraph(true);
      setGraphError("");
      try {
        const range = graphRange(fromDay, toDay);
        const params = new URLSearchParams({
          fromdate: range.from,
          todate: range.to,
          span,
        });
        if (shortCode.trim()) params.set("shortcode", shortCode.trim());
        const response = await fetch(`/graph?${params}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load analytics.");
        if (active) setGraph(result);
      } catch (error) {
        if (error.name !== "AbortError" && active) {
          setGraphError(error.message || "Unable to load analytics.");
        }
      } finally {
        if (active) setIsLoadingGraph(false);
      }
    }

    loadGraph();
    const refresh = window.setInterval(loadGraph, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(refresh);
    };
  }, [fromDay, toDay, span, shortCode, reloadToken]);

  async function createShortLink(event) {
    event.preventDefault();
    setCreateError("");
    setCreatedLink(null);
    setCopyMessage("");
    setIsCreating(true);
    try {
      const response = await fetch("/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create the short link.");
      setCreatedLink(result);
      setDestination("");
      setReloadToken((value) => value + 1);
    } catch (error) {
      setCreateError(error.message || "Unable to create the short link.");
    } finally {
      setIsCreating(false);
    }
  }

  async function copyShortLink() {
    try {
      await navigator.clipboard.writeText(createdLink.shortUrl);
      setCopyMessage("Copied to clipboard.");
    } catch {
      setCopyMessage("Clipboard access is unavailable. Select and copy the link.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Shortly home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M10 13.5a4 4 0 0 0 5.66 0l2.12-2.12a4 4 0 0 0-5.66-5.66l-1.22 1.22" />
              <path d="M14 10.5a4 4 0 0 0-5.66 0l-2.12 2.12a4 4 0 0 0 5.66 5.66l1.22-1.22" />
            </svg>
          </span>
          <span>shortly</span>
        </a>
        <span className="topbar-note">
          <span className="status-dot" />
          Link analytics
        </span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">YOUR LINKS, MADE SIMPLE</p>
          <h1>Make every link <span>count.</span></h1>
          <p className="hero-copy">
            Turn a long URL into a short, shareable link. Keep an eye on every click, all in one place.
          </p>
        </section>

        <section className="create-card" aria-labelledby="create-heading">
          <div className="section-heading">
            <div className="heading-icon" aria-hidden="true">↗</div>
            <div>
              <h2 id="create-heading">Create a short link</h2>
              <p>Paste a destination URL to get started.</p>
            </div>
          </div>
          <form className="create-form" onSubmit={createShortLink}>
            <label className="visually-hidden" htmlFor="destination">
              Destination URL
            </label>
            <input
              id="destination"
              type="url"
              required
              maxLength={2048}
              placeholder="https://example.com/your/very/long/link"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <button type="submit" disabled={isCreating}>
              {isCreating ? "Creating…" : "Shorten link"}
              {!isCreating && <span aria-hidden="true">↗</span>}
            </button>
          </form>
          {createError && <p className="notice error-notice" role="alert">{createError}</p>}
          {createdLink && (
            <div className="created-result" role="status">
              <div>
                <span className="result-label">Your short link</span>
                <a href={createdLink.shortUrl}>{createdLink.shortUrl}</a>
              </div>
              <button className="copy-button" type="button" onClick={copyShortLink}>
                Copy link
              </button>
              {copyMessage && <span className="copy-message">{copyMessage}</span>}
            </div>
          )}
        </section>

        <section className="analytics-section" aria-labelledby="analytics-heading">
          <div className="analytics-title-row">
            <div className="section-heading">
              <div className="heading-icon chart-icon" aria-hidden="true">⌁</div>
              <div>
                <h2 id="analytics-heading">Link activity</h2>
                <p>Creation and click activity over time.</p>
              </div>
            </div>
            <span className="freshness"><span className="status-dot" />Updates every 15 sec</span>
          </div>

          <div className="filters" aria-label="Analytics filters">
            <label>
              <span>Date range</span>
              <div className="date-range">
                <input
                  aria-label="Start date"
                  type="date"
                  value={fromDay}
                  onChange={(event) => setFromDay(event.target.value)}
                />
                <span>to</span>
                <input
                  aria-label="End date"
                  type="date"
                  value={toDay}
                  onChange={(event) => setToDay(event.target.value)}
                />
              </div>
            </label>
            <label>
              <span>Group by</span>
              <select value={span} onChange={(event) => setSpan(event.target.value)}>
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="1h">1 hour</option>
                <option value="1d">1 day</option>
              </select>
            </label>
            <label className="filter-code">
              <span>Short code <span className="optional">(optional)</span></span>
              <input
                type="text"
                maxLength={6}
                placeholder="All links"
                value={shortCode}
                onChange={(event) => setShortCode(event.target.value)}
              />
            </label>
          </div>

          <div className="summary-cards">
            <article className="summary-card">
              <span className="summary-label"><i className="legend-dot create-dot" />Links created</span>
              <strong>{isLoadingGraph && !graph ? "—" : totals.creates.toLocaleString()}</strong>
              <span className="summary-caption">in selected period</span>
            </article>
            <article className="summary-card">
              <span className="summary-label"><i className="legend-dot click-dot" />Total clicks</span>
              <strong>{isLoadingGraph && !graph ? "—" : totals.clicks.toLocaleString()}</strong>
              <span className="summary-caption">in selected period</span>
            </article>
          </div>

          <div className="chart-card">
            <div className="chart-heading">
              <div>
                <h3>Activity over time</h3>
                <p>UTC time buckets · {span} intervals</p>
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot create-dot" />Created</span>
                <span><i className="legend-dot click-dot" />Clicks</span>
              </div>
            </div>
            <div className="chart-area">
              {graphError ? (
                <div className="empty-state error-text" role="alert">{graphError}</div>
              ) : graphPoints.length === 0 && !isLoadingGraph ? (
                <div className="empty-state">No activity for this range yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={graphPoints} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="clickFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5572ee" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#5572ee" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="createFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2db89a" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2db89a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#edf0f5" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: span === "1d" ? undefined : "numeric",
                          timeZone: "UTC",
                        })
                      }
                      tick={{ fill: "#9299a8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={32}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#9299a8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                    />
                    <Tooltip
                      labelFormatter={(value) =>
                        new Date(value).toLocaleString(undefined, { timeZone: "UTC" })
                      }
                      contentStyle={{
                        border: "1px solid #e8ebf2",
                        borderRadius: 10,
                        boxShadow: "0 8px 24px #17234614",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      name="Clicks"
                      stroke="#5572ee"
                      strokeWidth={2.5}
                      fill="url(#clickFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="creates"
                      name="Created"
                      stroke="#2db89a"
                      strokeWidth={2.5}
                      fill="url(#createFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {isLoadingGraph && graph && <span className="refresh-indicator">Refreshing…</span>}
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>Shortly</span>
        <span>Small links. Clear insights.</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
