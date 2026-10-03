// Crée le premier compte « Direction » sur un projet Supabase distant (le seed de démo n'y est jamais poussé).
// Usage :
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/create-admin.mjs direction@hitravel.tn "Prénom Nom"
// Le mot de passe temporaire est affiché une seule fois ; le changer à la première connexion.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const [email, fullName] = process.argv.slice(2)
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!email || !fullName || !url || !key) {
  console.error('Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-admin.mjs <email> "<nom complet>"')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const password = randomBytes(12).toString('base64url')
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
if (error) {
  console.error('Création impossible :', error.message)
  process.exit(1)
}
const { error: profileError } = await supabase.from('staff_profiles').insert({ id: data.user.id, email, full_name: fullName, role: 'direction' })
if (profileError) {
  console.error('Profil non créé :', profileError.message)
  process.exit(1)
}
console.log(`Compte direction créé pour ${email}`)
console.log(`Mot de passe temporaire : ${password}`)
