import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  type UserCredential,
} from 'firebase/auth'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/db'
import { auth } from '../lib/firebase'
import { http, messageOf } from '../lib/http'

const BASE = '/api/vendor-auth'

/** Step 1 — send the email code before the account exists. */
export async function sendOtp(email: string) {
  const res = await http(`${BASE}/email-otp/send`, {
    method: 'POST',
    body: { email: email.toLowerCase().trim() },
  })
  if (res.status === 429) throw new Error(messageOf(res, 'Please wait before requesting a new code.'))
  if (res.status !== 200) throw new Error(messageOf(res, 'Failed to send code.'))
}

async function verifyOtp(email: string, code: string, uid: string) {
  const res = await http(`${BASE}/email-otp/verify`, {
    method: 'POST',
    body: { email: email.toLowerCase().trim(), code, uid },
  })
  if (res.status !== 200) throw new Error(messageOf(res, 'Verification failed.'))
}

/**
 * Step 2 — the Firebase account and its three documents, then the code.
 *
 * If any document write fails the Auth user is deleted again, so the vendor
 * can retry with a clean slate instead of an email that is "already in use"
 * by an account with no store behind it.
 */
export async function registerVendor(input: {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
  businessName: string
  businessEmail: string
  businessPhone: string
  universityId: string
  universityName: string
  otpCode: string
}): Promise<UserCredential> {
  const email = input.email.toLowerCase().trim()
  const credential = await createUserWithEmailAndPassword(auth, email, input.password)
  const uid = credential.user.uid
  const now = serverTimestamp()

  try {
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      businessName: input.businessName,
      role: 'vendor',
      photoUrl: '',
      accountStatus: 'active',
      isEmailVerified: false,
      isEmailOtpVerified: false,
      isPhoneVerified: false,
      createdAt: now,
      updatedAt: now,
    })

    await setDoc(doc(db, 'vendors', uid), {
      userId: uid,
      businessName: input.businessName,
      businessEmail: input.businessEmail,
      businessPhone: input.businessPhone,
      universityId: input.universityId,
      universityName: input.universityName,
      kycStatus: 'pending',
      vendorStatus: 'pending',
      rating: 0,
      totalSales: 0,
      createdAt: now,
    })

    // The campus is written at creation rather than left for a later edit:
    // buyers are filtered against it, so an untagged store is either
    // invisible or visible everywhere.
    await addDoc(collection(db, 'stores'), {
      vendorId: uid,
      storeName: input.businessName,
      universityId: input.universityId,
      universityName: input.universityName,
      description: '',
      logoUrl: '',
      bannerUrl: '',
      categoryIds: [],
      rating: 0,
      followersCount: 0,
      isActive: false,
      createdAt: now,
    })
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined)
    throw error
  }

  await verifyOtp(email, input.otpCode, uid)

  // Never surfaced: a welcome email that fails is not the vendor's problem.
  void http(`${BASE}/welcome-email`, {
    method: 'POST',
    body: { email, firstName: input.firstName, businessName: input.businessName, userType: 'vendor' },
  }).catch(() => undefined)

  return credential
}

export const login = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password)

/**
 * A branded reset email instead of Firebase's default. The server answers
 * 200 for unknown addresses too, so this only throws on a 5xx.
 */
export async function sendPasswordReset(email: string) {
  const res = await http(`${BASE}/password-reset/send`, {
    method: 'POST',
    body: { email: email.toLowerCase().trim() },
  })
  if (res.status >= 500) throw new Error('Something went wrong. Please try again.')
}

/** Firebase's error code, without the "auth/" prefix the web SDK adds. */
export function authCode(error: unknown): string | null {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' ? code.replace(/^auth\//, '') : null
}
