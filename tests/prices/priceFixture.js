'use strict';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function catalogFixture() {
  const insuranceCompanies = ['شركة ألف', 'شركة جيم'].map((name, i) => ({ id: id(20 + i), name }));
  const insuranceClasses = insuranceCompanies.flatMap((company, i) =>
    ['K1', 'K2'].map((name, j) => ({ id: id(30 + i * 2 + j), name, insuranceCompanyId: company.id, isAccepted: true })));
  const catalog = {
    clinic: { id: id(1), name: 'عيادة الاختبار' },
    services: ['جلسة أولى', 'جلسة ثانية'].map((name, i) => ({ id: id(10 + i), name })),
    paymentMethods: [{ id: id(2), code: 'cash', name: 'كاش' }, { id: id(3), code: 'insurance', name: 'تأمين' }],
    insuranceCompanies, insuranceClasses,
    branches: [{ id: id(4), name: 'فرع تجريبي', city: 'مدينة الاختبار', isActive: true, is_active: true }],
    specialties: [], workingHours: [],
  };
  const prices = catalog.services.flatMap((service, i) => [
    { clinicId: catalog.clinic.id, serviceId: service.id, paymentMethodId: id(2), price: 400 + i, currency: 'SAR' },
    ...insuranceClasses.map((item, j) => ({ clinicId: catalog.clinic.id, serviceId: service.id,
      paymentMethodId: id(3), insuranceCompanyId: item.insuranceCompanyId, insuranceClassId: item.id,
      price: 110 + i * 10 + j, currency: 'SAR' })),
  ]);
  const calls = [];
  const priceService = {
    async listApplicableInsuranceOptions({ serviceId }) {
      const rows = prices.filter(row => row.serviceId === serviceId);
      return { companies: insuranceCompanies.filter(company => rows.some(row => row.insuranceCompanyId === company.id)),
        classes: insuranceClasses.filter(item => rows.some(row => row.insuranceClassId === item.id)) };
    },
    async resolvePrice(input) {
      calls.push(input);
      const match = prices.find(row => ['clinicId', 'serviceId', 'paymentMethodId', 'insuranceCompanyId', 'insuranceClassId']
        .every(key => (row[key] || null) === (input[key] || null)));
      if (!match) throw new Error('No fixture price');
      return { price: match.price.toFixed(2), currency: match.currency };
    },
  };
  return { catalog, prices, calls, priceService };
}
module.exports = { catalogFixture };
