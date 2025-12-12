// Script para verificar y poblar loyalty balance para clientes existentes
import pg from 'pg';
const { Pool } = pg;

// Configurar la conexión a la base de datos del tenant
const pool = new Pool({
  connectionString: 'postgresql://roinuj:s5hE63lHhwL4bCtEprcN65jvDr2iYp8W@dpg-ct4ltsbqf0us73bsp03g-a.oregon-postgres.render.com/db_store_9',
  ssl: { rejectUnauthorized: false }
});

async function checkAndPopulateLoyaltyBalance() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando clientes sin loyalty balance...\n');
    
    // Obtener todos los clientes
    const customersResult = await client.query(`
      SELECT id, name, store_id 
      FROM customers 
      ORDER BY id
    `);
    
    console.log(`📊 Total de clientes: ${customersResult.rows.length}\n`);
    
    // Verificar cuántos tienen balance
    const balanceResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM customer_loyalty_balance
    `);
    
    console.log(`💰 Clientes con loyalty balance: ${balanceResult.rows[0].count}\n`);
    
    // Encontrar clientes sin balance
    const missingBalanceResult = await client.query(`
      SELECT c.id, c.name, c.store_id
      FROM customers c
      LEFT JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
      WHERE clb.id IS NULL
    `);
    
    if (missingBalanceResult.rows.length > 0) {
      console.log(`⚠️  Clientes sin balance de puntos: ${missingBalanceResult.rows.length}\n`);
      console.log('Creando balances para estos clientes...\n');
      
      for (const customer of missingBalanceResult.rows) {
        await client.query(`
          INSERT INTO customer_loyalty_balance 
            (customer_id, store_id, current_balance, total_points_earned, total_points_redeemed)
          VALUES 
            ($1, $2, '0', '0', '0')
        `, [customer.id, customer.store_id]);
        
        console.log(`✅ Balance creado para: ${customer.name} (ID: ${customer.id})`);
      }
      
      console.log('\n✨ Todos los balances han sido creados!\n');
    } else {
      console.log('✅ Todos los clientes ya tienen balance de puntos\n');
    }
    
    // Mostrar un resumen de algunos balances
    const sampleBalances = await client.query(`
      SELECT 
        c.id,
        c.name,
        clb.current_balance,
        clb.total_points_earned,
        clb.total_points_redeemed,
        clb.points_property_name
      FROM customers c
      JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
      LIMIT 5
    `);
    
    console.log('📋 Muestra de balances de puntos:');
    console.log('═══════════════════════════════════════════════════════════\n');
    for (const row of sampleBalances.rows) {
      console.log(`Cliente: ${row.name} (ID: ${row.id})`);
      console.log(`  Balance actual: ${row.current_balance}`);
      console.log(`  Total ganado: ${row.total_points_earned}`);
      console.log(`  Total canjeado: ${row.total_points_redeemed}`);
      console.log(`  Nombre de puntos: ${row.points_property_name || 'No configurado'}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndPopulateLoyaltyBalance();
