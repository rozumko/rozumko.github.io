import 'dotenv/config'

const SUPABASE_URL = process.env.SUPABASE_URL!
const email = process.env.SUPABASE_EMAIL!
const password = process.env.SUPABASE_PASSWORD!

const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': process.env.SUPABASE_ANON_KEY! },
  body: JSON.stringify({ email, password }),
})

const data = await res.json()
console.log(JSON.stringify(data, null, 2))
