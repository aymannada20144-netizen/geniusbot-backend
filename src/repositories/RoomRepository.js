const BaseRepository = require('../core/BaseRepository');

class RoomRepository extends BaseRepository {
  constructor(db) {
    super(db, 'rooms');
  }

  /**
   * الحصول على غرفة مفعلة.
   */
  async findActiveById(roomId) {
    const sql = `
      SELECT
        id,
        branch_id,
        room_number,
        room_name,
        room_type,
        is_active
      FROM ${this.fullTableName}
      WHERE id = $1
        AND is_active = true
      LIMIT 1
    `;

    const result = await this.query(sql, [
      roomId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * التحقق من وجود صيانة أو إيقاف مؤقت
   * يتداخل مع الموعد المطلوب.
   */
  async hasTimeOff(
    roomId,
    appointmentStart,
    appointmentEnd
  ) {
    const sql = `
      SELECT 1
      FROM geniusbot.room_time_off
      WHERE room_id = $1
        AND start_datetime < $3
        AND end_datetime > $2
      LIMIT 1
    `;

    const result = await this.query(sql, [
      roomId,
      appointmentStart,
      appointmentEnd,
    ]);

    return result.rowCount > 0;
  }
}

module.exports = RoomRepository;