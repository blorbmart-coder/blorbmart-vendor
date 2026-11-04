import { useEffect, useState } from 'react'
import { AppBar, Page, PageBody } from '../../components/AppBar'
import { Spinner } from '../../components/Spinner'
import { Card } from '../../components/ui'
import { http } from '../../lib/http'

interface Report {
  count: number
  average: number | null
  distribution: Record<string, number>
  positive: number
  negative: number
  compliments: { tag: string; count: number }[]
  complaints: { tag: string; count: number }[]
  trend: { week: string; count: number; average: number }[]
  comments: { stars: number; comment: string; month: string }[]
}

const PERIODS: Array<[number, string]> = [
  [30, '30 days'],
  [90, '90 days'],
  [365, 'Year'],
]

/**
 * What customers think of the store, from GET /api/ratings/me/store-report.
 *
 * Comments arrive without the customer's name, order number or exact time:
 * feedback is for improving the kitchen, not for finding who wrote it.
 */
export default function RatingsPage() {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    http(`/api/ratings/me/store-report?days=${days}`, { auth: true })
      .then((res) => {
        if (cancelled) return
        if (!res.ok) setError(String(res.body.message || 'Could not load your ratings.'))
        else setReport((res.body.data as Report | null) ?? null)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    <Page>
      <AppBar title="Ratings and feedback" back />
      <PageBody>
        <div className="space-y-4 p-4">
          <div className="flex gap-2">
            {PERIODS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className="rounded-full px-3.5 py-1.5"
                style={{
                  background: days === value ? 'var(--color-brand)' : 'var(--color-surface)',
                  color: days === value ? '#fff' : 'var(--color-ink-strong)',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {!loading && error && <p className="t-body-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          {!loading && !error && (!report || report.count === 0) && (
            <Card>
              <p className="t-h4">No ratings yet</p>
              <p className="t-caption-sm mt-1">
                Customers rate the food after delivery. Their stars and comments will show here.
              </p>
            </Card>
          )}

          {!loading && report && report.count > 0 && (
            <>
              <Card>
                <div className="flex items-end gap-3">
                  <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{report.average?.toFixed(1)}</span>
                  <span className="t-body-sm pb-1">{`★ from ${report.count} rating${report.count === 1 ? '' : 's'}`}</span>
                </div>
                <div className="mt-3 space-y-1">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = report.distribution[n] ?? 0
                    return (
                      <div key={n} className="flex items-center gap-2">
                        <span className="t-caption-sm w-6">{`${n}★`}</span>
                        <div className="h-2 flex-1 rounded-full" style={{ background: 'var(--color-line)' }}>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${(c / report.count) * 100}%`, background: n >= 4 ? '#00B894' : n <= 2 ? '#E74C3C' : '#F39C12' }}
                          />
                        </div>
                        <span className="t-caption-sm w-6 text-right">{c}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <p className="t-overline">PRAISED FOR</p>
                  {report.compliments.length === 0 && <p className="t-caption-sm mt-1">Nothing tagged yet</p>}
                  {report.compliments.slice(0, 4).map((c) => (
                    <p key={c.tag} className="t-body-sm mt-1">{`${c.tag} · ${c.count}`}</p>
                  ))}
                </Card>
                <Card>
                  <p className="t-overline">COMPLAINTS</p>
                  {report.complaints.length === 0 && <p className="t-caption-sm mt-1">None. Keep it up.</p>}
                  {report.complaints.slice(0, 4).map((c) => (
                    <p key={c.tag} className="t-body-sm mt-1" style={{ color: 'var(--color-danger)' }}>{`${c.tag} · ${c.count}`}</p>
                  ))}
                </Card>
              </div>

              {report.comments.length > 0 && (
                <Card>
                  <p className="t-overline">WHAT CUSTOMERS WROTE</p>
                  {report.comments.map((c, i) => (
                    <div key={i} className="mt-3">
                      <p className="t-caption-sm">{`${'★'.repeat(c.stars)} · ${c.month}`}</p>
                      <p className="t-body-sm">{c.comment}</p>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
