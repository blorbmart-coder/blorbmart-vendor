import { AddCircle, Card as CardIcon, Lock, Refresh, TickCircle, Trash, Warning2 } from 'iconsax-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Page } from '../../components/AppBar'
import { showDialog, showSheet, toast } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { digitsOnly, isRecord } from '../../lib/format'
import { isSuccess, walletApi } from './api'
import { bankAccountFromJson, type BankAccount } from './model'
import { BRAND, ErrorView, GREEN, GREY, MORANGE, MRED, rw, WalletAppBar, WalletButton, WalletHandle } from './ui'

/** A 4-digit PIN check before any change to where money goes. */
function verifyPin(): Promise<boolean> {
  return showDialog<boolean>((close) => <PinDialog onDone={close} />, { dismissible: false, width: 360 }).then(
    (ok) => ok ?? false,
  )
}

/** The payout bank account: view, replace, or remove. */
export default function BankAccountPage() {
  const [account, setAccount] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await walletApi.getBankAccount()
    if (isSuccess(res) && res.data) {
      const raw = res.data
      const json = 'id' in raw ? raw : isRecord(raw.bankAccount) ? raw.bankAccount : null
      setAccount(json ? bankAccountFromJson(json) : null)
    } else {
      // "Not found" is an empty state, not an error.
      const message = res.error
      setError(message && !message.toLowerCase().includes('not found') ? message : null)
      setAccount(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const showAdd = async () => {
    if (!(await verifyPin())) return
    const saved = await showSheet<boolean>((close) => <AddBankSheet onSaved={() => close(true)} />, {
      handle: false,
    })
    if (saved) void load()
  }

  const remove = async () => {
    const confirmed = await showDialog<boolean>(
      (close) => (
        <div className="p-6 pb-4" style={{ borderRadius: 16 }}>
          <h2 style={rw(19, 700, 'var(--color-ink)')}>Remove Bank Account</h2>
          <p className="mt-4" style={rw(14, 500, 'var(--color-ink-body)', { lineHeight: 1.5 })}>
            Are you sure you want to remove this bank account? You will not be able to withdraw until you add a new one.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => close(false)} className="ink rounded-full px-3 py-2.5" style={rw(14, 500, 'var(--color-brand)')}>
              Cancel
            </button>
            <button type="button" onClick={() => close(true)} className="ink rounded-full px-3 py-2.5" style={rw(14, 700, '#F44336')}>
              Remove
            </button>
          </div>
        </div>
      ),
      { width: 400 },
    )
    if (!confirmed || !(await verifyPin())) return
    const res = await walletApi.deleteBankAccount()
    if (isSuccess(res)) {
      setAccount(null)
      toast('Bank account removed', { background: GREEN, plain: true })
    } else {
      toast(res.error ?? 'Failed to remove account', { background: '#F44336', plain: true })
    }
  }

  return (
    <Page background="#fff">
      <WalletAppBar title="Bank Account" />
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color={BRAND} />
        </div>
      ) : error ? (
        <ErrorView message={error} onRetry={() => void load()} iconButton />
      ) : account ? (
        <div className="scroll-y flex-1">
          <div className="p-5">
            <div className="relative overflow-hidden rounded-[20px] p-[22px]" style={{ background: BRAND }}>
              <span className="absolute -right-5 -top-5 h-20 w-20 rounded-full" style={{ background: 'rgb(255 255 255 / 0.07)' }} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span style={rw(10, 700, 'rgb(255 255 255 / 0.65)', { letterSpacing: 1 })}>{account.bankName.toUpperCase()}</span>
                  <span className="h-7 w-9 rounded-[6px]" style={{ background: 'rgb(255 255 255 / 0.2)' }} />
                </div>
                <p className="mt-4" style={rw(22, 800, '#fff', { letterSpacing: 3 })}>
                  {account.maskedAccountNumber}
                </p>
                <p className="mt-2" style={rw(13, 600, 'rgb(255 255 255 / 0.85)')}>
                  {account.accountName}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[16px] p-4" style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}>
              {[
                ['Bank Name', account.bankName],
                ['Account Number', account.maskedAccountNumber],
                ['Account Name', account.accountName],
                ['Bank Code', account.bankCode],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center py-2.5">
                  <span className="flex-1" style={rw(13, 400, GREY[500])}>
                    {label}
                  </span>
                  <span style={rw(13, 600, '#000')}>{value}</span>
                </div>
              ))}
              <div className="flex items-center py-2.5">
                <span className="flex-1" style={rw(13, 400, GREY[500])}>
                  Status
                </span>
                <VerifiedChip verified={account.isVerified} />
              </div>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => void showAdd()}
                className="ink h-[52px] flex-1 rounded-[14px]"
                style={{ border: `1px solid ${BRAND}`, ...rw(14, 700, BRAND) }}
              >
                Change Account
              </button>
              <button
                type="button"
                aria-label="Remove bank account"
                onClick={() => void remove()}
                className="ink grid h-[52px] w-[52px] place-items-center rounded-[14px]"
                style={{ border: '1px solid #F44336' }}
              >
                <Trash size={18} color="#F44336" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <CardIcon size={72} color={GREY[300]} />
          <h2 className="mt-4" style={rw(18, 700, GREY[600])}>
            No Bank Account
          </h2>
          <p className="mt-2" style={rw(13, 400, GREY[500], { lineHeight: 1.5 })}>
            Add a bank account to start withdrawing your earnings.
          </p>
          <button
            type="button"
            onClick={() => void showAdd()}
            className="ink mt-6 flex items-center gap-2 rounded-[14px] px-6 py-3.5"
            style={{ background: BRAND, color: '#fff', boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)' }}
          >
            <AddCircle size={24} color="#fff" />
            <span style={rw(14, 700)}>Add Bank Account</span>
          </button>
        </div>
      )}
    </Page>
  )
}

function VerifiedChip({ verified }: { verified: boolean }) {
  const color = verified ? GREEN : MORANGE.base
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-[20px] px-2.5 py-1"
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span style={rw(11, 700, color)}>{verified ? 'Verified' : 'Unverified'}</span>
    </span>
  )
}

const fieldStyle = (focusedColor?: string): CSSProperties => ({
  background: GREY[50],
  boxShadow: `inset 0 0 0 ${focusedColor ? 1.5 : 1}px ${focusedColor ?? GREY[300]}`,
})

const sheetLabel = (text: string) => <p style={rw(10, 700, GREY[500], { letterSpacing: 0.8 })}>{text.toUpperCase()}</p>

/** Adding a payout account: pick the bank, type ten digits, see the name. */
function AddBankSheet({ onSaved }: { onSaved: () => void }) {
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([])
  const [loadingBanks, setLoadingBanks] = useState(true)
  const [banksError, setBanksError] = useState<string | null>(null)
  const [bankCode, setBankCode] = useState('')
  const [number, setNumber] = useState('')
  const [accountName, setAccountName] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [focus, setFocus] = useState<'bank' | 'number' | null>(null)
  // Only the newest lookup may write its answer: typing fast must never show
  // the name that belongs to the previous number.
  const lookup = useRef(0)

  const loadBanks = useCallback(async () => {
    setLoadingBanks(true)
    setBanksError(null)
    const res = await walletApi.getBanks()
    if (isSuccess(res) && res.data) {
      const raw = res.data
      const list = Array.isArray(raw.banks) ? raw.banks : Array.isArray(raw.data) ? raw.data : Object.values(raw).filter(isRecord)
      setBanks(
        list
          .filter(isRecord)
          .map((b) => ({ code: String(b.code ?? b.id ?? ''), name: String(b.name ?? '') }))
          .filter((b) => b.code && b.name),
      )
    } else {
      setBanksError(res.error ?? 'Could not load banks')
    }
    setLoadingBanks(false)
  }, [])

  useEffect(() => {
    void loadBanks()
  }, [loadBanks])

  const verify = async (code: string, digits: string) => {
    if (!code || digits.length !== 10) return
    const id = ++lookup.current
    setVerifying(true)
    setVerifyError(null)
    setAccountName(null)
    const res = await walletApi.verifyBankAccount(code, digits)
    if (id !== lookup.current) return
    if (isSuccess(res) && res.data) setAccountName(String(res.data.accountName ?? res.data.account_name ?? ''))
    else setVerifyError(res.error ?? 'Could not verify account number')
    setVerifying(false)
  }

  const save = async () => {
    if (!bankCode || number.length !== 10 || accountName == null) return
    setSaving(true)
    const res = await walletApi.addBankAccount(bankCode, number)
    setSaving(false)
    if (isSuccess(res)) onSaved()
    else toast(res.error ?? 'Failed to save account', { background: '#F44336', plain: true })
  }

  const canSave = Boolean(bankCode) && number.length === 10 && accountName != null && !saving && !verifying

  return (
    <div className="scroll-y pb-safe min-h-0 flex-1">
      <div className="px-5 pb-8">
        <WalletHandle />
        <h2 style={rw(20, 800, '#000')}>Add Bank Account</h2>
        <p className="mt-1" style={rw(12, 400, GREY[500])}>
          Your account name will be verified via Paystack
        </p>

        <div className="mt-5">{sheetLabel('Bank Name')}</div>
        <div className="mt-2">
          {loadingBanks ? (
            <div className="grid h-[52px] place-items-center rounded-[12px]" style={fieldStyle()}>
              <Spinner size={18} stroke={2} color={BRAND} />
            </div>
          ) : banksError ? (
            <button
              type="button"
              onClick={() => void loadBanks()}
              className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-[12px]"
              style={{ background: MRED[50], border: `1px solid ${MRED[200]}` }}
            >
              <Refresh size={14} color={MRED.base} />
              <span style={rw(12, 400, MRED.base)}>Failed to load banks — tap to retry</span>
            </button>
          ) : (
            <select
              value={bankCode}
              required
              aria-label="Bank"
              onFocus={() => setFocus('bank')}
              onBlur={() => setFocus(null)}
              onChange={(e) => {
                setBankCode(e.target.value)
                setAccountName(null)
                setVerifyError(null)
                if (number.length === 10) void verify(e.target.value, number)
              }}
              className="h-[52px] w-full appearance-none rounded-[12px] px-3.5 outline-none invalid:text-[#BDBDBD]"
              style={{ ...fieldStyle(focus === 'bank' ? BRAND : undefined), ...rw(13, 400, '#000') }}
            >
              <option value="" disabled hidden>
                Select your bank
              </option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-4">{sheetLabel('Account Number')}</div>
        <div className="relative mt-2">
          <input
            value={number}
            inputMode="numeric"
            maxLength={10}
            placeholder="0123456789"
            aria-label="Account number"
            autoComplete="off"
            onFocus={() => setFocus('number')}
            onBlur={() => setFocus(null)}
            onChange={(e) => {
              const v = digitsOnly(e.target.value).slice(0, 10)
              setNumber(v)
              setAccountName(null)
              setVerifyError(null)
              if (v.length === 10) void verify(bankCode, v)
            }}
            className="h-[52px] w-full rounded-[12px] px-3.5 outline-none placeholder:font-normal placeholder:text-[#BDBDBD]"
            style={{ ...fieldStyle(focus === 'number' ? BRAND : undefined), ...rw(16, 700, '#000') }}
          />
          {verifying && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <Spinner size={16} stroke={2} color={BRAND} />
            </span>
          )}
        </div>

        {(accountName != null || verifyError) && (
          <div
            className="mt-2 flex items-center gap-2 rounded-[10px] px-3 py-2.5"
            style={
              accountName != null
                ? { background: 'rgb(0 184 148 / 0.08)', border: '1px solid rgb(0 184 148 / 0.3)' }
                : { background: MRED[50], border: `1px solid ${MRED[200]}` }
            }
          >
            {accountName != null ? <TickCircle size={16} color={GREEN} /> : <Warning2 size={16} color={MRED.base} />}
            <span className="flex-1" style={rw(13, accountName != null ? 700 : 500, accountName != null ? GREEN : MRED.base)}>
              {accountName ?? verifyError}
            </span>
          </div>
        )}

        <div className="mt-6">
          <WalletButton disabled={!canSave} onClick={() => void save()}>
            {saving ? (
              <Spinner size={20} stroke={2} color="#fff" track={null} />
            ) : (
              <span style={rw(16, 700)}>{accountName != null ? 'Save Account' : 'Verify & Save'}</span>
            )}
          </WalletButton>
        </div>
      </div>
    </div>
  )
}

function PinDialog({ onDone }: { onDone: (ok?: boolean) => void }) {
  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const press = async (key: string) => {
    if (verifying) return
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    setError(null)
    if (next.length < 4) return

    setVerifying(true)
    const res = await walletApi.verifyPin(next)
    if (isSuccess(res)) {
      onDone(true)
      return
    }
    setError(res.error ?? 'Invalid PIN. Try again.')
    setPin('')
    setVerifying(false)
  }

  return (
    <div className="flex flex-col items-center p-6">
      <Lock size={48} color={BRAND} />
      <h2 className="mt-4" style={rw(20, 800, '#000')}>
        Verify Your PIN
      </h2>
      <p className="mt-2 text-center" style={rw(13, 400, GREY[600])}>
        Enter your 4-digit PIN to confirm account change
      </p>
      <div className="mt-6 flex justify-center">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="mx-1 grid h-[52px] w-11 place-items-center rounded-[12px]"
            style={{ background: GREY[100], border: `${i < pin.length ? 2 : 1}px solid ${i < pin.length ? BRAND : GREY[300]}` }}
          >
            {i < pin.length && <span className="h-2 w-2 rounded-full" style={{ background: BRAND }} />}
          </span>
        ))}
      </div>
      <div className="h-3" />
      {verifying && (
        <div
          className="mb-3 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5"
          style={{ background: 'rgb(81 86 241 / 0.08)', border: '1px solid rgb(81 86 241 / 0.18)' }}
        >
          <Spinner size={16} stroke={2} color={BRAND} />
          <span style={rw(12, 700, BRAND)}>Verifying PIN...</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-3 flex w-full items-center gap-2 rounded-[8px] px-3 py-2"
          style={{ background: MRED[50], border: `1px solid ${MRED[200]}` }}
        >
          <Warning2 size={14} color={MRED.base} />
          <span className="flex-1" style={rw(12, 400, MRED.base)}>
            {error}
          </span>
        </div>
      )}
      <div className="mt-4 grid w-full grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={key}
              type="button"
              aria-label={key === '⌫' ? 'Delete' : key}
              onClick={() => void press(key)}
              className="grid aspect-square place-items-center rounded-[12px]"
              style={{
                background: key === '⌫' ? MRED[50] : GREY[100],
                border: `1px solid ${key === '⌫' ? MRED[200] : GREY[300]}`,
              }}
            >
              <span style={rw(20, 700, key === '⌫' ? MRED.base : '#000')}>{key}</span>
            </button>
          ),
        )}
      </div>
      <div className="mt-5 w-full">
        <button
          type="button"
          disabled={verifying}
          onClick={() => onDone(false)}
          className="ink h-12 w-full rounded-[12px]"
          style={{ border: '1px solid #9E9E9E', ...rw(14, 700, '#000') }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
