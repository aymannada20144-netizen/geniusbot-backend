'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const clinicId = '00000000-0000-0000-0000-000000000001';
const serviceIds = [
  '9a526e0a-7dfc-4669-a706-76e92cd20c26',
  '00000000-0000-0000-0000-000000000401',
  '03171d4e-5188-4ffa-b0a3-17f83e7a2448',
  '2a293364-12a6-4815-9991-94718251e7c9',
  '67a31af8-fc7a-4e76-b1ca-0d76bbda8559',
  'f2cb00db-489e-4590-b375-bdc6ab0050df',
];

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const services = (await client.query(`
      SELECT id, clinic_id, specialty_id, name, aliases, description,
             is_active, is_booking_enabled
      FROM geniusbot.services
      WHERE clinic_id = $1 AND id = ANY($2::uuid[])
      ORDER BY name, id
    `, [clinicId, serviceIds])).rows;
    const specialtyIds = [...new Set(services.map((row) => row.specialty_id))];
    const specialties = (await client.query(`
      SELECT id, clinic_id, name, description, is_active
      FROM geniusbot.specialties
      WHERE clinic_id = $1 AND id = ANY($2::uuid[])
      ORDER BY name, id
    `, [clinicId, specialtyIds])).rows;
    const knowledge = (await client.query(`
      SELECT id, clinic_id, service_id, title, content, category,
             keywords, priority, is_active
      FROM geniusbot.knowledge_base
      WHERE clinic_id = $1 AND service_id = ANY($2::uuid[])
      ORDER BY service_id, is_active DESC, category, title, id
    `, [clinicId, serviceIds])).rows;
    const assignments = (await client.query(`
      SELECT a.id, a.clinic_id, a.service_id, s.name AS service_name,
             a.branch_id, b.name AS branch_name, b.city,
             a.doctor_id, a.room_id, a.is_default, a.is_active
      FROM geniusbot.service_assignments a
      JOIN geniusbot.services s ON s.id = a.service_id
      JOIN geniusbot.branches b ON b.id = a.branch_id
      WHERE a.clinic_id = $1 AND a.service_id = ANY($2::uuid[])
      ORDER BY s.name, b.name, a.id
    `, [clinicId, serviceIds])).rows;
    await client.query('ROLLBACK');

    const snapshot = {
      dataset: 'B-DATA-01_AUTHORITATIVE_TEST_KNOWLEDGE',
      clinicId,
      counts: {
        services: services.length,
        specialties: specialties.length,
        knowledgeTotal: knowledge.length,
        knowledgeActive: knowledge.filter((row) => row.is_active).length,
        assignmentsTotal: assignments.length,
        assignmentsActive: assignments.filter((row) => row.is_active).length,
      },
      services,
      specialties,
      knowledge,
      assignments,
    };
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
    const outputPath = path.join(__dirname, 'snapshot.json');
    fs.writeFileSync(outputPath, serialized, 'utf8');
    const sha256 = crypto.createHash('sha256').update(serialized).digest('hex').toUpperCase();
    process.stdout.write(`${JSON.stringify({ outputPath, sha256, counts: snapshot.counts })}\n`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_rollbackError) {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
