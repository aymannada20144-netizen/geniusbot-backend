'use strict';

const db = require('../src/db/pool');

async function main() {
  const result = await db.query(`
    SELECT p.clinic_id, p.id AS patient_id, p.full_name,
      concat(
        left(regexp_replace(coalesce(p.whatsapp_id, p.phone_number), '\\D', '', 'g'), 3),
        '******',
        right(regexp_replace(coalesce(p.whatsapp_id, p.phone_number), '\\D', '', 'g'), 3)
      ) AS sender_mask,
      c.id AS conversation_id,
      c.patient_id AS conversation_patient_id,
      c.state_payload->'shaden'->'customer'->>'name' AS state_customer_name,
      c.state_payload->'shaden'->'booking'->>'patient_id' AS booking_patient_id,
      coalesce(
        c.state_payload->'shaden'->'booking'->>'full_name',
        c.state_payload->'shaden'->'booking'->>'patientName'
      ) AS booking_name,
      c.status,
      c.started_at
    FROM geniusbot.patients p
    LEFT JOIN geniusbot.conversations c
      ON c.clinic_id = p.clinic_id AND c.patient_id = p.id
    WHERE p.full_name IN ('منة', 'فردوس')
       OR c.state_payload::text LIKE '%فردوس%'
    ORDER BY c.started_at DESC NULLS LAST
  `);
  console.log(JSON.stringify(result.rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
