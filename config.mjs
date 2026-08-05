import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const BCRYPT_SALT_ROUND = Number(process.env.BCRYPT_SALT_ROUND)
const JWT_SECRET = process.env.JWT_SECRET

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.EMAIL_FROM

// Subscription Remote Config — change in .env to affect all users without app update
const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS) || 90
const MONTHLY_PRICE = Number(process.env.MONTHLY_PRICE) || 99
const YEARLY_PRICE = Number(process.env.YEARLY_PRICE) || 999
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || ''
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ''

export { PORT, MONGODB_URI, BCRYPT_SALT_ROUND, JWT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, DEFAULT_TRIAL_DAYS, MONTHLY_PRICE, YEARLY_PRICE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET }