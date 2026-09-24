import { Book, Flash, InfoCircle, Lock, Mobile, Monitor, TickCircle, Wifi, type Icon as IconType } from 'iconsax-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { showSheet, toast } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { isRecord } from '../../lib/format'
import { billsApi, isSuccess, walletApi } from './api'
import { formatNaira, walletFromJson, type WalletOverview } from './model'
import { BRAND, GREEN, GREY, MRED, NumPad, PinBoxes, rw, WalletAppBar, WalletButton, WalletHandle } from './ui'

/**
 * Pay Bills — airtime, data, electricity and TV, paid from the vendor's
 * earnings, approved with the wallet PIN.
 *
 * A vendor's money already sits in this wallet, so topping up a phone or
 * buying a power token should not mean withdrawing to a bank first. The form
 * is driven by the catalogue — each biller says which fields it needs — so a
 * new biller needs no change here. Mirrors blorb_vendor's bills_page.dart.
 */

interface Category {
  id: string
  label: string
}

interface Service {
  id: string
  category: string
  name: string
  color: string
  inputs: string[]
  accountLabel: string
  min: number
  max: number
  fee: number
}

interface Plan {
  code: string
  name: string
  amount: number
  periodLabel: string
  /** The data allowance, "1.5GB", when the provider says. */
  size: string
  /** "30 days", "2 hours". */
  validity: string
  /** Anything else the provider says about the plan. */
  details: string
}

/**
 * The two lines on a plan tile. The allowance leads when the provider gives
 * one; otherwise the name's first chunk. Some networks name plans by price
 * ("Daily Plan N75 — 1 day"), so the details sheet carries the full name.
 */
const SIZE = /(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i
function planLines(p: Plan) {
  const match = `${p.name} ${p.details}`.match(SIZE)
  const size = p.size || (match ? `${match[1]}${match[2].toUpperCase()}` : '')
  const [first, ...rest] = p.name.split(/\s*[—–-]\s*/)
  return size
    ? { headline: size, detail: p.validity || p.periodLabel || rest.join(' · ') }
    : { headline: first, detail: rest.join(' · ') }
}

interface Payment {
  id: string
  serviceName: string
  category: string
  totalAmount: number
  phone: string
  accountNumber: string
  variationName: string
  status: string
  token: string
  units: string
  failureReason: string
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const list = <T,>(v: unknown, map: (m: Record<string, unknown>) => T): T[] =>
  Array.isArray(v) ? v.filter(isRecord).map(map) : []

const serviceFrom = (m: Record<string, unknown>): Service => ({
  id: str(m.id),
  category: str(m.category),
  name: str(m.name),
  color: str(m.color) || BRAND,
  inputs: Array.isArray(m.inputs) ? m.inputs.map(str) : [],
  accountLabel: str(m.accountLabel) || 'Account number',
  min: num(m.min),
  max: num(m.max),
  fee: num(m.fee),
})

const paymentFrom = (m: Record<string, unknown>): Payment => ({
  id: str(m.id),
  serviceName: str(m.serviceName),
  category: str(m.category),
  totalAmount: num(m.totalAmount ?? m.amount),
  phone: str(m.phone),
  accountNumber: str(m.accountNumber),
  variationName: str(m.variationName),
  status: str(m.status),
  token: str(m.token),
  units: str(m.units),
  failureReason: str(m.failureReason),
})

const CATEGORY_ICONS: Record<string, IconType> = {
  airtime: Mobile,
  data: Wifi,
  electricity: Flash,
  tv: Monitor,
  education: Book,
}

const METER_TYPES = [
  ['prepaid', 'Prepaid'],
  ['postpaid', 'Postpaid'],
] as const

const PERIOD_ORDER = ['Daily', 'Weekly', 'Monthly', '2 months+', 'Other']
const ALL = 'All'

/** "All" plus each period that has plans; nothing when there is one or none. */
function periodsOf(plans: Plan[]) {
  const present = new Set(plans.map((p) => p.periodLabel).filter(Boolean))
  if (present.size < 2) return []
  return [ALL, ...PERIOD_ORDER.filter((p) => present.has(p)), ...[...present].filter((p) => !PERIOD_ORDER.includes(p))]
}

const needs = (service: Service | null, input: string) => Boolean(service?.inputs.includes(input))
const cleanPhone = (v: string) => v.replace(/\D/g, '').slice(0, 11)
const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const label = (text: string) => <p style={rw(10, 700, GREY[500], { letterSpacing: 0.8 })}>{text.toUpperCase()}</p>

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="ink inline-flex shrink-0 items-center gap-1.5 rounded-[20px] px-4 py-2"
      style={{
        background: active ? BRAND : GREY[100],
        border: `1px solid ${active ? BRAND : GREY[200]}`,
        ...rw(13, 600, active ? '#fff' : GREY[600]),
      }}
    >
      {children}
    </button>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  inputMode: 'tel' | 'numeric'
  ariaLabel: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      aria-label={ariaLabel}
      className="mt-2 w-full rounded-[12px] px-4 py-3.5 outline-none placeholder:text-[#BDBDBD]"
      style={{ ...rw(16, 600, '#000'), background: GREY[50], boxShadow: `inset 0 0 0 1px ${GREY[300]}` }}
      onFocus={(e) => (e.currentTarget.style.boxShadow = `inset 0 0 0 1.5px ${BRAND}`)}
      onBlur={(e) => (e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${GREY[300]}`)}
    />
  )
}

export default function BillsPage() {
  const nav = useNav()
  const [wallet, setWallet] = useState<WalletOverview | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<Payment[]>([])

  const [categoryId, setCategoryId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [phone, setPhone] = useState('')
  const [account, setAccount] = useState('')
  const [meterType, setMeterType] = useState('prepaid')
  const [amount, setAmount] = useState('')
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [period, setPeriod] = useState(ALL)
  const [customer, setCustomer] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const reloadWallet = useCallback(
    () =>
      walletApi.getWallet().then((res) => {
        if (isSuccess(res) && res.data) setWallet(walletFromJson(res.data))
      }),
    [],
  )
  const reloadHistory = useCallback(
    () =>
      billsApi.history().then((res) => {
        if (isSuccess(res) && res.data) setHistory(list(res.data.payments, paymentFrom))
      }),
    [],
  )

  useEffect(() => {
    void reloadWallet()
    void reloadHistory()
    void billsApi.catalog().then((res) => {
      if (!isSuccess(res) || !res.data) {
        setLoadError(res.error ?? 'Bills are not available right now.')
        setCategories([])
        return
      }
      setCategories(list(res.data.categories, (m) => ({ id: str(m.id), label: str(m.label) })))
      setServices(list(res.data.services, serviceFrom))
    })
  }, [reloadWallet, reloadHistory])

  const category = categoryId || categories?.[0]?.id || ''
  const inCategory = useMemo(() => services.filter((s) => s.category === category), [services, category])
  const service = inCategory.find((s) => s.id === serviceId) ?? inCategory[0] ?? null

  // Plans for the chosen biller, when it sells bundles.
  const serviceKey = needs(service, 'variation') ? service?.id : undefined
  useEffect(() => {
    if (!serviceKey) return
    let alive = true
    void billsApi.plans(serviceKey).then((res) => {
      if (!alive) return
      setPlans(
        isSuccess(res) && res.data
          ? list(res.data.variations, (m) => ({
              code: str(m.code),
              name: str(m.name),
              amount: num(m.amount),
              periodLabel: str(m.periodLabel),
              size: str(m.size),
              validity: str(m.validity),
              details: str(m.details),
            }))
          : [],
      )
    })
    return () => {
      alive = false
    }
  }, [serviceKey])

  /** A different biller: its plans, customer and amount no longer apply. */
  const chooseService = (id: string) => {
    setServiceId(id)
    setPlans(null)
    setPlan(null)
    setPeriod(ALL)
    setCustomer(null)
    setAccount('')
  }

  const verify = async () => {
    if (!service) return
    setVerifying(true)
    const res = await billsApi.verifyCustomer(
      service.id,
      account.trim(),
      needs(service, 'meterType') ? meterType : undefined,
    )
    setVerifying(false)
    if (isSuccess(res) && res.data) setCustomer(str(res.data.name) || 'Account found')
    else toast(res.error ?? 'We could not find that account.', { background: '#F44336', plain: true })
  }

  const value = plan ? plan.amount : Number(amount) || 0
  const fee = service?.fee ?? 0
  const total = value + fee
  const available = wallet?.availableBalance ?? 0
  const periods = periodsOf(plans ?? [])
  const shownPlans = (plans ?? []).filter((p) => period === ALL || p.periodLabel === period)

  const problem = (() => {
    if (!service) return 'Choose a biller'
    if (needs(service, 'phone') && cleanPhone(phone).length !== 11) return 'Enter an 11-digit phone number'
    if (needs(service, 'account') && !customer) return `Confirm the ${service.accountLabel.toLowerCase()}`
    if (needs(service, 'variation') && !plan) return 'Choose a plan'
    if (!plan && needs(service, 'amount')) {
      if (!value) return 'Enter an amount'
      if (service.min && value < service.min) return `Minimum is ${formatNaira(service.min)}`
      if (service.max && value > service.max) return `Maximum is ${formatNaira(service.max)}`
    }
    if (wallet && total > available) return `You have ${formatNaira(available)} available`
    return null
  })()

  const target = needs(service, 'phone') ? cleanPhone(phone) : account.trim()

  const showPlanDetails = (p: Plan) =>
    void showSheet<boolean>(
      (close) => (
        <PlanDetailsSheet
          plan={p}
          networkName={service?.name ?? ''}
          fee={fee}
          isSelected={plan?.code === p.code}
          onChoose={() => close(true)}
        />
      ),
      { handle: false },
    ).then((chosen) => {
      if (chosen) setPlan(p)
    })

  const pay = () => {
    if (!service || problem) return
    if (wallet && !wallet.pinSet) {
      void nav.push('/wallet/pin').then(() => reloadWallet())
      return
    }
    const idempotencyKey = newKey()
    void showSheet<Payment>(
      (close) => (
        <PinSheet
          title={`${service.name}${plan ? ` · ${plan.name}` : ''}`}
          target={target}
          total={total}
          onSubmit={async (pin) => {
            const res = await billsApi.purchase({
              serviceKey: service.id,
              amount: plan ? undefined : value,
              phone: needs(service, 'phone') ? cleanPhone(phone) : undefined,
              accountNumber: needs(service, 'account') ? account.trim() : undefined,
              variationCode: plan?.code,
              meterType: needs(service, 'meterType') ? meterType : undefined,
              pin,
              idempotencyKey,
            })
            if (isSuccess(res) && res.data) {
              close(paymentFrom(res.data))
              return null
            }
            if (res.code === 'PIN_NOT_SET') {
              close()
              void nav.push('/wallet/pin').then(() => reloadWallet())
              return null
            }
            return res.error ?? 'That payment did not go through.'
          }}
        />
      ),
      { handle: false },
    ).then((payment) => {
      if (!payment) return
      void reloadWallet()
      void reloadHistory()
      void showSheet((close) => <ResultSheet payment={payment} onDone={() => close()} />, { handle: false })
    })
  }

  return (
    <Page background="#fff">
      <WalletAppBar title="Pay Bills" />
      {categories === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color={BRAND} />
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p style={rw(16, 700, '#000')}>Bills are not available right now</p>
          <p className="mt-2" style={rw(13, 400, GREY[500])}>
            {loadError ?? 'Try again in a little while.'}
          </p>
        </div>
      ) : (
        <div className="scroll-y flex-1">
          <div className="p-5">
            <div
              className="rounded-[14px] p-4"
              style={{ background: 'rgb(81 86 241 / 0.06)', border: '1px solid rgb(81 86 241 / 0.2)' }}
            >
              <p style={rw(10, 700, BRAND, { letterSpacing: 0.8 })}>PAYING FROM YOUR EARNINGS</p>
              <p className="mt-1" style={rw(26, 800, BRAND)}>
                {wallet ? formatNaira(available) : '—'}
              </p>
            </div>

            <div className="no-scrollbar overflow-x-auto -mx-5 mt-5 flex gap-2 px-5">
              {categories.map((c) => {
                const IconC = CATEGORY_ICONS[c.id] ?? Mobile
                const active = c.id === category
                return (
                  <Chip
                    key={c.id}
                    active={active}
                    onClick={() => {
                      setCategoryId(c.id)
                      chooseService('')
                      setAmount('')
                    }}
                  >
                    <IconC size={16} color={active ? '#fff' : GREY[600]} />
                    {c.label}
                  </Chip>
                )
              })}
            </div>

            <div className="mt-5">{label('Biller')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {inCategory.map((s) => (
                <Chip key={s.id} active={s.id === service?.id} onClick={() => chooseService(s.id)}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.name}
                </Chip>
              ))}
            </div>

            {needs(service, 'phone') && (
              <>
                <div className="mt-5">{label('Phone number')}</div>
                <TextInput
                  value={phone}
                  onChange={(v) => setPhone(cleanPhone(v))}
                  placeholder="080 0000 0000"
                  inputMode="tel"
                  ariaLabel="Phone number"
                />
              </>
            )}

            {needs(service, 'meterType') && (
              <div className="mt-5 flex gap-2">
                {METER_TYPES.map(([id, text]) => (
                  <Chip
                    key={id}
                    active={meterType === id}
                    onClick={() => {
                      setMeterType(id)
                      setCustomer(null)
                    }}
                  >
                    {text}
                  </Chip>
                ))}
              </div>
            )}

            {needs(service, 'account') && service && (
              <>
                <div className="mt-5">{label(service.accountLabel)}</div>
                <TextInput
                  value={account}
                  onChange={(v) => {
                    setAccount(v.replace(/\s/g, ''))
                    setCustomer(null)
                  }}
                  placeholder={service.accountLabel}
                  inputMode="numeric"
                  ariaLabel={service.accountLabel}
                />
                {customer ? (
                  <div
                    className="mt-2 flex items-center gap-2 rounded-[12px] px-3.5 py-3"
                    style={{ background: 'rgb(0 184 148 / 0.08)', border: '1px solid rgb(0 184 148 / 0.3)' }}
                  >
                    <TickCircle size={18} color={GREEN} variant="Bold" />
                    <span className="truncate" style={rw(14, 700, '#000')}>
                      {customer}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2">
                    <WalletButton outline={BRAND} disabled={verifying || account.trim().length < 5} onClick={() => void verify()}>
                      {verifying ? <Spinner size={18} stroke={2} color={BRAND} track={null} /> : <span style={rw(14, 700)}>Check account</span>}
                    </WalletButton>
                  </div>
                )}
              </>
            )}

            {needs(service, 'variation') && (
              <>
                <div className="mt-5">{label('Choose a plan')}</div>
                {periods.length > 0 && (
                  <div className="no-scrollbar overflow-x-auto -mx-5 mt-2 flex gap-2 px-5">
                    {periods.map((p) => (
                      <Chip key={p} active={p === period} onClick={() => setPeriod(p)}>
                        {p}
                      </Chip>
                    ))}
                  </div>
                )}
                {plans === null ? (
                  <div className="flex justify-center py-6">
                    <Spinner color={BRAND} />
                  </div>
                ) : plans.length === 0 ? (
                  <p className="mt-2" style={rw(13, 400, GREY[500])}>
                    No plans listed for {service?.name} right now.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {shownPlans.map((p) => {
                      const active = plan?.code === p.code
                      const { headline, detail } = planLines(p)
                      return (
                        // The info button sits beside the tile, not inside
                        // it: a button inside a button is not valid.
                        <div key={p.code} className="relative">
                          <button
                            type="button"
                            onClick={() => setPlan(p)}
                            className="ink h-full w-full rounded-[12px] p-3 pr-9 text-left"
                            style={{
                              background: active ? 'rgb(81 86 241 / 0.08)' : '#fff',
                              border: `${active ? 1.5 : 1}px solid ${active ? BRAND : GREY[200]}`,
                            }}
                          >
                            <span className="line-clamp-2 block" style={rw(14, 800, '#000')}>
                              {headline}
                            </span>
                            {detail && (
                              <span className="line-clamp-2 mt-0.5 block" style={rw(11, 400, GREY[500])}>
                                {detail}
                              </span>
                            )}
                            <span className="mt-1 block" style={rw(14, 800, active ? BRAND : '#000')}>
                              {formatNaira(p.amount)}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Details for ${p.name}`}
                            onClick={() => showPlanDetails(p)}
                            className="ink absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full"
                          >
                            <InfoCircle size={17} color={GREY[500]} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* The chosen plan in full, so nobody pays for a name they
                    could only read the start of. */}
                {plan && (
                  <p
                    className="mt-3 rounded-[12px] px-3.5 py-2.5"
                    style={{ background: 'rgb(81 86 241 / 0.06)', ...rw(12, 500, '#000', { lineHeight: 1.5 }) }}
                  >
                    <span style={rw(12, 800, BRAND)}>Selected: </span>
                    {plan.name}
                  </p>
                )}
              </>
            )}

            {needs(service, 'amount') && !plan && (
              <>
                <div className="mt-5">{label('Amount (₦)')}</div>
                <TextInput
                  value={amount}
                  onChange={(v) => setAmount(v.replace(/\D/g, ''))}
                  placeholder={service?.min ? `From ${service.min}` : '0'}
                  inputMode="numeric"
                  ariaLabel="Amount"
                />
              </>
            )}

            {value > 0 && (
              <div className="mt-5 rounded-[12px] p-4" style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}>
                <SummaryRow left={plan ? plan.name : (service?.name ?? '')} right={formatNaira(value)} />
                <SummaryRow left="Fee" right={fee > 0 ? formatNaira(fee) : 'Free'} />
                <div className="mt-2 flex justify-between pt-2" style={{ borderTop: `1px solid ${GREY[200]}` }}>
                  <span style={rw(14, 700, '#000')}>Total</span>
                  <span style={rw(16, 800, '#000')}>{formatNaira(total)}</span>
                </div>
              </div>
            )}

            <div className="mt-6">
              <WalletButton disabled={Boolean(problem)} onClick={pay}>
                <span className="inline-flex items-center gap-2" style={rw(16, 700)}>
                  {!problem && <Lock size={18} color="#fff" />}
                  {problem ?? `Pay ${formatNaira(total)}`}
                </span>
              </WalletButton>
            </div>

            {history.length > 0 && (
              <div className="mb-8 mt-8">
                {label('Recent bills')}
                <div className="mt-2">
                  {history.map((p) => {
                    const IconC = CATEGORY_ICONS[p.category] ?? Mobile
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${GREY[100]}` }}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]" style={{ background: GREY[100] }}>
                          <IconC size={18} color={GREY[600]} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate" style={rw(13, 700, '#000')}>
                            {p.serviceName} · {p.phone || p.accountNumber}
                          </span>
                          <span className="block" style={rw(11, 500, statusColor(p.status))}>
                            {statusLabel(p.status)}
                          </span>
                        </span>
                        <span style={rw(13, 700, GREY[600])}>−{formatNaira(p.totalAmount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}

/** Everything known about one plan, with its full, untruncated name. */
function PlanDetailsSheet({
  plan,
  networkName,
  fee,
  isSelected,
  onChoose,
}: {
  plan: Plan
  networkName: string
  fee: number
  isSelected: boolean
  onChoose: () => void
}) {
  const rows: Array<[string, string]> = [
    ['Network', networkName],
    ['Data', plan.size],
    ['Includes', plan.details && plan.details !== plan.size ? plan.details : ''],
    ['Valid for', plan.validity || plan.periodLabel],
    ['Price', formatNaira(plan.amount)],
    ['Fee', fee > 0 ? formatNaira(fee) : ''],
  ]
  return (
    <div className="pb-safe px-5 pb-8">
      <WalletHandle />
      <h2 style={rw(20, 800, '#000')}>Plan details</h2>
      <div
        className="mt-4 rounded-[14px] p-4"
        style={{ background: 'rgb(81 86 241 / 0.06)', border: '1px solid rgb(81 86 241 / 0.2)' }}
      >
        <p style={rw(26, 800, BRAND)}>{planLines(plan).headline}</p>
        <p className="mt-1" style={rw(13, 500, GREY[600], { lineHeight: 1.5 })}>
          {plan.name}
        </p>
      </div>
      <div className="mt-4">
        {rows
          .filter(([, value]) => value)
          .map(([left, right]) => (
            <SummaryRow key={left} left={left} right={right} />
          ))}
        <div className="mt-2 flex justify-between pt-2" style={{ borderTop: `1px solid ${GREY[200]}` }}>
          <span style={rw(14, 700, '#000')}>You pay</span>
          <span style={rw(16, 800, '#000')}>{formatNaira(plan.amount + fee)}</span>
        </div>
      </div>
      <div className="mt-6">
        <WalletButton onClick={onChoose}>
          <span style={rw(16, 700)}>{isSelected ? 'Selected' : 'Choose this plan'}</span>
        </WalletButton>
      </div>
    </div>
  )
}

function SummaryRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="truncate" style={rw(13, 400, GREY[600])}>
        {left}
      </span>
      <span style={rw(13, 600, GREY[600])}>{right}</span>
    </div>
  )
}

const statusLabel = (status: string) =>
  status === 'delivered' ? 'Delivered' : status === 'refunded' ? 'Refunded to your wallet' : status === 'failed' ? 'Failed' : 'Processing'

const statusColor = (status: string) =>
  status === 'delivered' ? GREEN : status === 'failed' ? MRED.base : status === 'refunded' ? BRAND : '#F57C00'

/** The wallet PIN, on the same pad as a withdrawal. Submits on the fourth digit. */
function PinSheet({
  title,
  target,
  total,
  onSubmit,
}: {
  title: string
  target: string
  total: number
  onSubmit: (pin: string) => Promise<string | null>
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const press = (key: string) => {
    if (busy) return
    setError(null)
    if (key === '⌫') return setPin((p) => p.slice(0, -1))
    const next = pin.length < 4 ? pin + key : pin
    setPin(next)
    if (next.length === 4) {
      setBusy(true)
      void onSubmit(next).then((message) => {
        setBusy(false)
        if (message) {
          setError(message)
          setPin('')
        }
      })
    }
  }

  return (
    <div className="pb-safe px-5 pb-8">
      <WalletHandle />
      <p className="text-center" style={rw(12, 500, GREY[500])}>
        {title}
      </p>
      <p className="mt-0.5 text-center" style={rw(14, 700, '#000')}>
        {target}
      </p>
      <p className="mt-3 text-center" style={rw(28, 800, BRAND)}>
        {formatNaira(total)}
      </p>
      <p className="mt-4 text-center" style={rw(12, 600, GREY[600])}>
        Enter your wallet PIN to pay
      </p>
      <div className="mt-3 flex justify-center">
        {busy ? (
          <div className="grid h-14 place-items-center">
            <Spinner color={BRAND} />
          </div>
        ) : (
          <PinBoxes length={pin.length} width={52} height={56} gap={6} dot={10} radius={12} />
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-center" style={rw(12, 500, MRED.base)}>
          {error}
        </p>
      )}
      <div className="mt-4">
        <NumPad onKey={press} disabled={busy} />
      </div>
    </div>
  )
}

function ResultSheet({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const delivered = payment.status === 'delivered'
  const refunded = payment.status === 'refunded'
  const failed = payment.status === 'failed'
  const color = delivered ? GREEN : failed ? MRED.base : refunded ? BRAND : '#F57C00'

  return (
    <div className="pb-safe flex flex-col items-center px-5 pb-10">
      <WalletHandle />
      <div className="mt-2 grid h-[72px] w-[72px] place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <TickCircle size={36} color={color} variant={delivered ? 'Bold' : 'Linear'} />
      </div>
      <h2 className="mt-4" style={rw(22, 800, '#000')}>
        {statusLabel(payment.status)}
      </h2>
      <p className="mt-1 text-center" style={rw(13, 600, GREY[600])}>
        {payment.serviceName}
        {payment.variationName ? ` · ${payment.variationName}` : ''} · {payment.phone || payment.accountNumber}
      </p>

      {payment.token && (
        <button
          type="button"
          className="ink mt-4 w-full rounded-[12px] p-4 text-center"
          style={{ background: 'rgb(0 184 148 / 0.08)', border: '1px solid rgb(0 184 148 / 0.3)' }}
          onClick={() =>
            void navigator.clipboard?.writeText(payment.token).then(
              () => toast('Token copied'),
              () => toast('Copy it by hand — the clipboard is blocked.'),
            )
          }
        >
          <span className="block" style={rw(10, 700, GREEN, { letterSpacing: 0.8 })}>
            TOKEN · TAP TO COPY
          </span>
          <span className="mt-1 block break-all" style={rw(20, 800, '#000', { letterSpacing: 1 })}>
            {payment.token}
          </span>
          {payment.units && (
            <span className="mt-1 block" style={rw(12, 500, GREY[600])}>
              {payment.units}
            </span>
          )}
        </button>
      )}

      <p className="mt-4 text-center" style={rw(13, 400, GREY[600], { lineHeight: 1.6 })}>
        {delivered
          ? `${formatNaira(payment.totalAmount)} was paid from your earnings.`
          : refunded
            ? `It did not go through, so ${formatNaira(payment.totalAmount)} is back in your wallet.`
            : failed
              ? payment.failureReason || 'It did not go through, and nothing was taken from your wallet.'
              : 'The biller is still confirming it. It will update under Recent bills.'}
      </p>
      <div className="mt-6 w-full">
        <WalletButton onClick={onDone}>
          <span style={rw(16, 700)}>Done</span>
        </WalletButton>
      </div>
    </div>
  )
}
