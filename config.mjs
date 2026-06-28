import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const BCRYPT_SALT_ROUND = Number(process.env.BCRYPT_SALT_ROUND)
const JWT_SECRET = process.env.JWT_SECRET

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_HOST
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.EMAIL_FROM

export { PORT, MONGODB_URI, BCRYPT_SALT_ROUND, JWT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM }