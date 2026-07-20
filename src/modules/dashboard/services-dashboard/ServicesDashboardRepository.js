'use strict';

const BaseRepository = require('../../../core/BaseRepository');

const {
    dashboardServiceBaseSelect,
    dashboardServiceBaseFrom
} = require('../queries/dashboardSharedQueries');

class ServicesDashboardRepository extends BaseRepository {

    constructor(db) {
        super(db, 'services');
    }

    async getServices(clinicId) {

        const sql = `
            ${dashboardServiceBaseSelect}

            ${dashboardServiceBaseFrom}

            WHERE s.clinic_id = $1

            ORDER BY
                s.is_active DESC,
                s.name ASC
        `;

        const { rows } = await this.query(sql, [clinicId]);

        return rows;
    }

    async getServiceById(clinicId, serviceId) {

        const sql = `
            ${dashboardServiceBaseSelect}

            ${dashboardServiceBaseFrom}

            WHERE
                s.clinic_id = $1
            AND
                s.id = $2
        `;

        const { rows } = await this.query(sql, [
            clinicId,
            serviceId
        ]);

        return rows[0] || null;
    }

}

module.exports = ServicesDashboardRepository;