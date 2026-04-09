import type { PageSpeedBulkResponse, PageSpeedBulkRow, PageSpeedStrategyMetrics } from "@/lib/types";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not run yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatScore(value: number | null): string {
  return value === null ? "—" : `${value}`;
}

function formatMetric(value: string | null): string {
  return value ?? "—";
}

function getSharedMetric(row: PageSpeedBulkRow, key: keyof PageSpeedStrategyMetrics): number | null {
  const mobileValue = row.mobile[key];

  if (typeof mobileValue === "number") {
    return mobileValue;
  }

  const desktopValue = row.desktop[key];

  return typeof desktopValue === "number" ? desktopValue : null;
}

type PageSpeedSectionProps = {
  error: string | null;
  isLoading: boolean;
  report: PageSpeedBulkResponse | null;
  onRun: () => void;
};

export function PageSpeedSection({ error, isLoading, report, onRun }: PageSpeedSectionProps) {
  return (
    <section className="integration integration--pagespeed">
      <div className="integration__header">
        <div>
          <p className="integration__eyebrow">PageSpeed</p>
          <h2>Bulk site checks</h2>
        </div>
        <div className="integration__actions">
          <button className="button" disabled={isLoading} onClick={onRun} type="button">
            {isLoading ? "Running..." : "Run PageSpeed bulk report"}
          </button>
        </div>
      </div>

      <section className="status-bar">
        <span className={report ? "status-bar__live-dot" : ""}>{isLoading ? "Running" : report ? "Ready" : "Idle"}</span>
        <span>
          {report
            ? `Checked ${report.totalSites} site${report.totalSites === 1 ? "" : "s"} • Updated ${formatTimestamp(report.fetchedAt)}`
            : "Reads the monitored site list from Vercel env vars on demand"}
        </span>
      </section>

      {error ? (
        <section className="alert alert--warning">
          <h2>PageSpeed issue</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {report ? (
        <section className="properties">
          <div className="properties-table properties-table--pagespeed" role="region" aria-label="PageSpeed bulk results">
            <table>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Mobile perf</th>
                  <th scope="col">Desktop perf</th>
                  <th scope="col">Accessibility</th>
                  <th scope="col">Best practices</th>
                  <th scope="col">SEO</th>
                  <th scope="col">Mobile FCP</th>
                  <th scope="col">Mobile LCP</th>
                  <th scope="col">Mobile TBT</th>
                  <th scope="col">Mobile CLS</th>
                  <th scope="col">Desktop FCP</th>
                  <th scope="col">Desktop LCP</th>
                  <th scope="col">Desktop TBT</th>
                  <th scope="col">Desktop CLS</th>
                  <th scope="col">Status</th>
                  <th scope="col">Report</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.url}>
                    <th className="properties-table__property properties-table__property--site" scope="row">
                      <span className="properties-table__property-name">{row.label}</span>
                      <span className="properties-table__property-meta">{row.url}</span>
                      {row.errorMessage ? (
                        <span className="properties-table__property-error">{row.errorMessage}</span>
                      ) : null}
                    </th>
                    <td className="properties-table__metric">{formatScore(row.mobile.performance)}</td>
                    <td className="properties-table__metric">{formatScore(row.desktop.performance)}</td>
                    <td className="properties-table__metric">
                      {formatScore(getSharedMetric(row, "accessibility"))}
                    </td>
                    <td className="properties-table__metric">
                      {formatScore(getSharedMetric(row, "bestPractices"))}
                    </td>
                    <td className="properties-table__metric">{formatScore(getSharedMetric(row, "seo"))}</td>
                    <td className="properties-table__timestamp">{formatMetric(row.mobile.firstContentfulPaint)}</td>
                    <td className="properties-table__timestamp">{formatMetric(row.mobile.largestContentfulPaint)}</td>
                    <td className="properties-table__timestamp">{formatMetric(row.mobile.totalBlockingTime)}</td>
                    <td className="properties-table__timestamp">
                      {formatMetric(row.mobile.cumulativeLayoutShift)}
                    </td>
                    <td className="properties-table__timestamp">{formatMetric(row.desktop.firstContentfulPaint)}</td>
                    <td className="properties-table__timestamp">
                      {formatMetric(row.desktop.largestContentfulPaint)}
                    </td>
                    <td className="properties-table__timestamp">{formatMetric(row.desktop.totalBlockingTime)}</td>
                    <td className="properties-table__timestamp">
                      {formatMetric(row.desktop.cumulativeLayoutShift)}
                    </td>
                    <td className="properties-table__status">
                      <span className={`pill pill--${row.status}`}>{row.status}</span>
                    </td>
                    <td className="properties-table__timestamp">
                      <a className="text-link" href={row.reportUrl} rel="noreferrer" target="_blank">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
