import { Card as CardIcon, Warning2 } from 'iconsax-react'
import { useEffect, useState } from 'react'
import { useLayer, useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { showSheet, toast } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { isSuccess, walletApi } from './api'
import { formatNaira, walletFromJson, type WalletOverview } from './model'
import { BRAND, GREY, MORANGE, NumPad, PinBoxes, rw, SuccessSheet, WalletAppBar, WalletButton } from './ui'

const label = (text: string) => <p style={rw(10, 700, GREY[500], { letterSpacing: 0.8 })}>{text.toUpperCase()}</p>

/** Withdraw Funds — an amount, the destination, and the wallet PIN. */
export default function WithdrawPage() {
  const layer = useLayer<{ wallet?: WalletOverview }>()
  const [wallet, setWallet] = useState<WalletOverview | null>(layer.data?.wallet ?? null)

  // Opened from a link rather than the wallet: read the balance itself.
  useEffect(() => {
    if (wallet) return
    void walletApi.getWallet().then((res) => {
      if (isSuccess(res) && res.data) setWallet(walletFromJson(res.data))
    })
  }, [wallet])

  return (
    <Page background="#fff">
      <WalletAppBar title="Withdraw Funds" />
      {wallet ? (
        <WithdrawForm wallet={wallet} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color={BRAND} />
        </div>
      )}
    </Page>
  )
}

function WithdrawForm({ wallet }: { wallet: WalletOverview }) {
  const nav = useNav()
  const [amount, setAmount] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [amountError, setAmountError] = useState<string | null>(null)

  const available = wallet.availableBalance > 0 ? wallet.availableBalance : 0
  const entered = Number.parseFloat(amount) || 0
  const balanceBroken = available <= 0
  const canSubmit = pin.length === 4 && entered >= 1000 && available > 0 && entered <= available && !submitting

  const press = (key: string) => {
    if (key === '⌫') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < 4 ? p + key : p))
  }

  const submit = async () => {
    if (entered < 1000) return setAmountError('Minimum withdrawal is ₦1,000')
    if (available <= 0) return setAmountError('Unable to read available balance. Please go back and reload the wallet.')
    if (entered > available) return setAmountError('Amount exceeds available balance')

    setSubmitting(true)
    setAmountError(null)
    const res = await walletApi.withdraw(entered, pin)
    setSubmitting(false)

    if (isSuccess(res)) {
      setPin('')
      void showSheet(
        (close) => (
          <SuccessSheet
            title="Withdrawal Initiated"
            message={`Your withdrawal of ${formatNaira(entered)} to ${wallet.bankAccount?.bankName ?? 'your bank'} ${
              wallet.bankAccount?.masked ?? ''
            } is being processed.`}
            onDone={() => {
              close()
              nav.pop()
            }}
          />
        ),
        { dismissible: false, handle: false },
      )
      return
    }
    toast(res.statusCode === 401 ? 'Incorrect PIN. Please try again.' : (res.error ?? 'Withdrawal failed'), {
      background: '#F44336',
      plain: true,
    })
    // A wrong PIN is re-entered from the start.
    if (res.statusCode === 401) setPin('')
  }

  return (
    <div className="scroll-y flex-1">
      <div className="p-5">
        {balanceBroken && (
          <div
            className="mb-4 flex items-center gap-2.5 rounded-[12px] p-3.5"
            style={{ background: MORANGE[50], border: `1px solid ${MORANGE[200]}` }}
          >
            <Warning2 size={18} color={MORANGE[700]} />
            <p className="flex-1" style={rw(12, 400, MORANGE[800], { lineHeight: 1.5 })}>
              Balance could not be loaded. Go back and pull-to-refresh the wallet, then try again.
            </p>
          </div>
        )}

        <div
          className="rounded-[14px] p-4"
          style={{ background: 'rgb(81 86 241 / 0.06)', border: '1px solid rgb(81 86 241 / 0.2)' }}
        >
          <p style={rw(10, 700, BRAND, { letterSpacing: 0.8 })}>AVAILABLE BALANCE</p>
          <p className="mt-1" style={rw(26, 800, balanceBroken ? MORANGE.base : BRAND)}>
            {balanceBroken ? 'Unavailable' : formatNaira(wallet.availableBalance)}
          </p>
        </div>

        <div className="mt-5">{label('Amount (₦)')}</div>
        <input
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
            setAmount(v)
            setAmountError(null)
          }}
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Amount"
          aria-invalid={amountError ? true : undefined}
          className="mt-2 w-full rounded-[12px] px-4 py-3.5 outline-none placeholder:text-[#BDBDBD]"
          style={{
            ...rw(18, 700, '#000'),
            background: GREY[50],
            boxShadow: `inset 0 0 0 1px ${amountError ? '#F44336' : GREY[300]}`,
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = `inset 0 0 0 1.5px ${amountError ? '#F44336' : BRAND}`)}
          onBlur={(e) => (e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${amountError ? '#F44336' : GREY[300]}`)}
        />
        {amountError && (
          <p role="alert" className="px-3 pt-1.5" style={rw(12, 400, '#D32F2F')}>
            {amountError}
          </p>
        )}
        <p className="mt-1.5" style={rw(11, 400, GREY[500])}>
          {balanceBroken ? 'Min ₦1,000' : `Min ₦1,000 — Max ${formatNaira(wallet.availableBalance)}`}
        </p>

        <div className="mt-5">{label('Destination Account')}</div>
        <div className="mt-2 flex items-center rounded-[12px] px-3.5 py-3" style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}>
          <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: BRAND }}>
            <CardIcon size={16} color="#fff" />
          </span>
          <span className="ml-3">
            <span className="block" style={rw(13, 700, '#000')}>
              {wallet.bankAccount?.bankName ?? 'No bank linked'}
            </span>
            <span className="block" style={rw(11, 400, GREY[500])}>
              {wallet.bankAccount?.masked ?? '—'}
            </span>
          </span>
        </div>

        <div className="mt-7">{label('Wallet PIN')}</div>
        <div className="mt-3.5">
          <PinBoxes length={pin.length} width={52} height={56} gap={6} dot={10} radius={12} />
        </div>
        <div className="mt-5">
          <NumPad onKey={press} />
        </div>
        <div className="mb-6 mt-6">
          <WalletButton disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? <Spinner size={20} stroke={2} color="#fff" track={null} /> : <span style={rw(16, 700)}>Confirm Withdrawal</span>}
          </WalletButton>
        </div>
      </div>
    </div>
  )
}
