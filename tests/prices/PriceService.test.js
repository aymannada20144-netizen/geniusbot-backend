'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const PriceRepository = require('../../src/repositories/PriceRepository');
const PriceService = require('../../src/services/PriceService');

const IDS = Object.freeze({
  clinic: '00000000-0000-0000-0000-000000000001',
  service: '00000000-0000-0000-0000-000000000002',
  payment: '00000000-0000-0000-0000-000000000003',
  company: '00000000-0000-0000-0000-000000000004',
  insuranceClass: '00000000-0000-0000-0000-000000000005',
});

function context(overrides = {}) {
  return {
    clinic_id: IDS.clinic,
    clinic_is_active: true,
    clinic_timezone: 'Asia/Riyadh',
    service_id: IDS.service,
    service_clinic_id: IDS.clinic,
    service_is_active: true,
    payment_method_id: IDS.payment,
    payment_method_clinic_id: IDS.clinic,
    payment_method_is_active: true,
    payment_method_code: 'cash',
    insurance_company_id: null,
    insurance_company_clinic_id: null,
    insurance_company_is_active: null,
    insurance_class_id: null,
    insurance_class_company_id: null,
    insurance_class_is_active: null,
    ...overrides,
  };
}

function repository(overrides = {}) {
  return {
    findResolutionContext: async () => context(),
    findApplicablePrices: async () => [{
      id: 'price-1',
      price: '125.00',
      currency: 'SAR',
    }],
    ...overrides,
  };
}

describe('PriceService', () => {
  test('resolves the exact cash price using the clinic booking date', async () => {
    let lookup;
    const service = new PriceService(repository({
      findApplicablePrices: async (input) => {
        lookup = input;
        return [{ id: 'price-1', price: '0.00', currency: 'SAR' }];
      },
    }));

    const result = await service.resolvePrice({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      paymentMethodId: IDS.payment,
      bookingDate: '2026-08-01T21:30:00.000Z',
    });

    assert.equal(lookup.bookingDate, '2026-08-02');
    assert.equal(result.price, '0.00');
    assert.equal(result.currency, 'SAR');
  });

  test('requires both insurance identifiers', async () => {
    const service = new PriceService(repository({
      findResolutionContext: async () => context({
        payment_method_code: 'insurance',
        insurance_company_id: IDS.company,
        insurance_company_clinic_id: IDS.clinic,
        insurance_company_is_active: true,
      }),
    }));

    await assert.rejects(
      service.resolvePrice({
        clinicId: IDS.clinic,
        serviceId: IDS.service,
        paymentMethodId: IDS.payment,
        insuranceCompanyId: IDS.company,
        bookingDate: '2026-08-02',
      }),
      /Insurance company and insurance class are required/
    );
  });

  test('rejects inactive and cross-clinic resources', async () => {
    const inactive = new PriceService(repository({
      findResolutionContext: async () => context({
        service_is_active: false,
      }),
    }));
    await assert.rejects(
      inactive.resolvePrice({
        clinicId: IDS.clinic,
        serviceId: IDS.service,
        paymentMethodId: IDS.payment,
        bookingDate: '2026-08-02',
      }),
      /Service not found or inactive/
    );

    const crossClinic = new PriceService(repository({
      findResolutionContext: async () => context({
        payment_method_clinic_id:
          '00000000-0000-0000-0000-000000000099',
      }),
    }));
    await assert.rejects(
      crossClinic.resolvePrice({
        clinicId: IDS.clinic,
        serviceId: IDS.service,
        paymentMethodId: IDS.payment,
        bookingDate: '2026-08-02',
      }),
      /Payment method does not belong to the clinic/
    );
  });

  test('rejects expired or overlapping application results', async () => {
    const expired = new PriceService(repository({
      findApplicablePrices: async () => [],
    }));
    await assert.rejects(
      expired.resolvePrice({
        clinicId: IDS.clinic,
        serviceId: IDS.service,
        paymentMethodId: IDS.payment,
        bookingDate: '2026-08-02',
      }),
      /No active price applies/
    );

    const overlap = new PriceService(repository({
      findApplicablePrices: async () => [{ id: 'one' }, { id: 'two' }],
    }));
    await assert.rejects(
      overlap.resolvePrice({
        clinicId: IDS.clinic,
        serviceId: IDS.service,
        paymentMethodId: IDS.payment,
        bookingDate: '2026-08-02',
      }),
      /Multiple active prices apply/
    );
  });

  test('maps unique insurance options owned by applicable price rows', async () => {
    const service = new PriceService(repository({
      findApplicableInsuranceOptions: async () => [
        {
          insurance_company_id: IDS.company,
          insurance_company_name: 'بوبا',
          insurance_class_id: IDS.insuranceClass,
          insurance_class_name: 'VIP',
        },
        {
          insurance_company_id: IDS.company,
          insurance_company_name: 'بوبا',
          insurance_class_id: IDS.insuranceClass,
          insurance_class_name: 'VIP',
        },
      ],
    }));
    const result = await service.listApplicableInsuranceOptions({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      paymentMethodId: IDS.payment,
    });
    assert.deepEqual(result.companies, [{ id: IDS.company, name: 'بوبا' }]);
    assert.deepEqual(result.classes, [{
      id: IDS.insuranceClass,
      insuranceCompanyId: IDS.company,
      name: 'VIP',
      isAccepted: true,
    }]);
  });
});

describe('PriceRepository', () => {
  test('owns a parameterized exact-scope date query', async () => {
    let captured;
    const db = {
      query: async (sql, params) => {
        captured = { sql, params };
        return { rows: [] };
      },
    };
    const prices = new PriceRepository(db);
    await prices.findApplicablePrices({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      paymentMethodId: IDS.payment,
      insuranceCompanyId: null,
      insuranceClassId: null,
      bookingDate: '2026-08-02',
    });

    assert.match(captured.sql, /IS NOT DISTINCT FROM \$4::uuid/);
    assert.match(captured.sql, /p\.valid_from <= \$6::date/);
    assert.match(captured.sql, /p\.valid_to IS NULL OR p\.valid_to >= \$6::date/);
    assert.match(captured.sql, /p\.is_active IS TRUE/);
    assert.deepEqual(captured.params, [
      IDS.clinic,
      IDS.service,
      IDS.payment,
      null,
      null,
      '2026-08-02',
    ]);
  });

  test('owns the current price-scoped insurance option query', async () => {
    let captured;
    const prices = new PriceRepository({
      query: async (sql, params) => {
        captured = { sql, params };
        return { rows: [] };
      },
    });
    await prices.findApplicableInsuranceOptions({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      paymentMethodId: IDS.payment,
      insuranceCompanyId: IDS.company,
    });
    assert.match(captured.sql, /p\.is_active IS TRUE/);
    assert.match(captured.sql, /p\.valid_from <=/);
    assert.match(captured.sql, /cls\.is_accepted IS TRUE/);
    assert.match(captured.sql, /p\.insurance_company_id = \$4/);
    assert.deepEqual(captured.params, [
      IDS.clinic, IDS.service, IDS.payment, IDS.company,
    ]);
  });
});
