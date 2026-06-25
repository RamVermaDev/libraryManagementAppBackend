import dotenv from 'dotenv'

dotenv.config()

const PORT = process.env.PORT
const MONGODB_URI = process.env.MONGODB_URI
const BCRYPT_SALT_ROUND = Number(process.env.BCRYPT_SALT_ROUND)
const JWT_SECRET = process.env.JWT_SECRET

export {PORT, MONGODB_URI, BCRYPT_SALT_ROUND, JWT_SECRET}