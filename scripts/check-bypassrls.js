const { Client } = require('pg')

async function checkBypassRls() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4,
  })

  try {
    await client.connect()

    const result = await client.query(`
      SELECT rolname, rolbypassrls
      FROM pg_roles
      WHERE rolname = 'app_user'
    `)

    const role = result.rows[0]

    if (!role) {
      console.error('❌ ERRO: usuario app_user nao encontrado no banco.')
      process.exit(1)
    }

    if (role.rolbypassrls === true) {
      console.error('❌ ERRO DE SEGURANCA: app_user tem BYPASSRLS ativo!')
      console.error('   Isso viola o isolamento de tenant. Corrija imediatamente.')
      process.exit(1)
    }

    console.log('✅ app_user OK — rolbypassrls = false')
    process.exit(0)
  } catch (err) {
    console.error('❌ Erro ao conectar no banco:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

checkBypassRls()