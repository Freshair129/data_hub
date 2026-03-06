
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Updating Existing Employees ---');

        // Update Nuwat (em_agt_01)
        await pool.query(`
      UPDATE employees 
      SET metadata = jsonb_set(
        metadata, 
        '{aliases}', 
        '["Nuwat Chalerm-adirek", "Nuwat Ngammoong", "Nuwat"]'::jsonb
      )
      WHERE employee_id = 'em_agt_01'
    `);
        console.log('Updated Nuwat aliases.');

        // Update Pornpon (em_mgt_01)
        await pool.query(`
      UPDATE employees 
      SET metadata = jsonb_set(
        metadata, 
        '{aliases}', 
        '["Pornpon Thanasuwanathan", "พรรณพล ธนสุวรรณธาร", "บอส", "Boss"]'::jsonb
      )
      WHERE employee_id = 'em_mgt_01'
    `);
        console.log('Updated Pornpon aliases.');

        console.log('\n--- Creating New Employees/Agency Records ---');

        const newEmployees = [
            {
                id: 'cmm7jh9ma00003bm6q9h6auax', // Unique ID
                employee_id: 'TVS-EMP-010',
                agent_id: 'PAR-01',
                first_name: 'Parat',
                last_name: 'Thanasuwanathan',
                nick_name: 'Parat',
                role: 'Management/Owner',
                department: 'Management',
                status: 'Active',
                email: 'parat@vschool.co.th',
                metadata: { aliases: ['Parat Thanasuwanathan', 'Parat'] }
            },
            {
                id: 'cmm7jh9ma00003bm6q9h6auay',
                employee_id: 'TVS-EMP-011',
                agent_id: 'PIM-01',
                first_name: 'Pim',
                last_name: 'Somsiri',
                nick_name: 'Pim',
                role: 'Agency/Admin',
                department: 'Marketing',
                status: 'Active',
                email: 'pim@vschool.co.th',
                metadata: { aliases: ['Pim Somsiri', 'Pim'] }
            },
            {
                id: 'cmm7jh9ma00003bm6q9h6auaz',
                employee_id: 'TVS-EMP-012',
                agent_id: 'JIB-01',
                first_name: 'Jib',
                last_name: 'S.',
                nick_name: 'Jib',
                role: 'Agency/Admin',
                department: 'Marketing',
                status: 'Active',
                email: 'jib@vschool.co.th',
                metadata: { aliases: ['Jib S.', 'Jib'] }
            }
        ];

        for (const emp of newEmployees) {
            await pool.query(`
        INSERT INTO employees (
          id, employee_id, agent_id, first_name, last_name, nick_name, 
          role, department, status, email, metadata, 
          password_hash, permissions, performance,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          metadata = EXCLUDED.metadata
      `, [
                emp.id, emp.employee_id, emp.agent_id, emp.first_name, emp.last_name, emp.nick_name,
                emp.role, emp.department, emp.status, emp.email, JSON.stringify(emp.metadata),
                'changeme', JSON.stringify({ is_admin: false }), JSON.stringify({})
            ]);
            console.log(`Ensured employee: ${emp.first_name} (${emp.employee_id})`);
        }

    } catch (err) {
        console.error('Error during update:', err);
    } finally {
        await pool.end();
    }
}

main();
