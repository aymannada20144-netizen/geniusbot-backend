'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const formatter = require('../../src/services/shaden/ShadenMessageFormatter');

const { RLM, LRI, PDI } = formatter.controls;
const r = (value) => `${RLM}${value}`;
const i = (value) => `${LRI}${value}${PDI}`;
const requiredService = { name: 'إزالة الشعر بالليزر', requiresDoctor: true, requiresRoom: true };
const optionalService = { name: 'استشارة عامة', requiresDoctor: false, requiresRoom: false };
const branch = { name: 'فرع الصالحية', city: 'جدة' };

describe('WhatsApp booking message formatting', () => {
  test('formats the confirmation summary as compact label/value lines', () => {
    const text = formatter.formatBookingSummary({ service: requiredService, branch, doctor: { name: 'د. علياء' }, room: { number: '102', name: 'غرفة ليزر' }, dateText: 'الأحد، ٢ أغسطس ٢٠٢٦', timeText: '١١:٠٠ ص', paymentMethod: { name: 'كاش' } });
    for (const label of ['الخدمة', 'الفرع', 'الطبيبة', 'الغرفة', 'التاريخ', 'الوقت', 'طريقة الدفع']) assert.match(text, new RegExp(`\\*${label}:\\* .+`, 'u'));
    assert.doesNotMatch(text, /\* \*/u);
    assert.doesNotMatch(text, /\n{3,}/u);
  });

  test('formats success as a compact final appointment card', () => {
    const text = formatter.formatBookingSuccess({ service: requiredService, branch, doctor: { name: 'د. علياء' }, room: { number: '102', name: 'غرفة ليزر' }, dateText: 'الأحد، ٢ أغسطس ٢٠٢٦', timeText: '١١:٠٠ ص', paymentMethod: { name: 'كاش' }, bookingReference: 'appointment-100' });
    assert.match(text, /🔖 \*رقم الحجز:\*.*appointment-100/u);
    assert.match(text, /🩺 \*الخدمة:\*/u);
    assert.doesNotMatch(text, /\n{3,}|\* \*/u);
  });

  test('omits unneeded resources, empty values, and UUID references', () => {
    const text = formatter.formatBookingSuccess({ service: optionalService, branch, doctor: null, room: null, dateText: 'السبت', timeText: '١١:٠٠ ص', paymentMethod: null, bookingReference: '00000000-0000-4000-8000-000000000001' });
    assert.doesNotMatch(text, /الطبيب|الغرفة|طريقة الدفع|رقم الحجز|null|undefined|00000000/);
    assert.match(text, /استشارة عامة/);
  });

  test('supports room number only and room number with name', () => {
    assert.match(formatter.formatBookingSummary({ service: requiredService, room: { number: '301' } }), new RegExp(`الغرفة:\\* ${LRI}301${PDI}`));
    assert.match(formatter.formatBookingSummary({ service: requiredService, room: { number: '301', name: 'غرفة العلاج' } }), /— غرفة العلاج/);
  });

  test('pending success returns only the approved waiting message', () => {
    const text = formatter.formatBookingSuccess({
      customerName: 'منة',
      bookingReference: '25DD4527',
      service: { name: 'فيلر', requiresDoctor: true, requiresRoom: true },
      branch: { city: 'جدة', name: 'فرع الصالحية' },
      doctor: { name: 'د. سارة الشمري' },
      room: { number: '301', name: 'غرفة حقن' },
      dateText: 'الأحد، 2 أغسطس 2026',
      timeText: '11:00 ص',
      paymentMethod: { name: 'تأمين', code: 'insurance' },
      insuranceCompany: { name: 'بوبا' },
      insuranceClass: { name: 'A' },
      quotedPrice: '250.00',
      currency: 'SAR',
      appointmentStatus: 'pending',
    });
    assert.equal(
      text.replaceAll(RLM, ''),
      '✅ تم تسجيل طلب حجزك بنجاح\n\n' +
      'طلبك بانتظار تأكيد العيادة، وستصلك رسالة منفصلة بعد التأكيد 🌸'
    );
  });

  test('cash success omits absent optional and insurance labels and UUIDs', () => {
    const text = formatter.formatBookingSuccess({
      customerName: 'منة',
      bookingReference: '25DD4527',
      service: { name: 'استشارة', requiresDoctor: false, requiresRoom: false },
      branch: { name: 'الفرع الرئيسي' },
      paymentMethod: { name: 'كاش', code: 'cash' },
      appointmentStatus: 'pending',
    });
    assert.doesNotMatch(text, /الطبيب:|الغرفة:|شركة التأمين:|فئة التأمين:|السعر:|null|undefined/);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-/i);
  });

  test('formats SAR decimals as one RTL-safe numeric token', () => {
    const whole = formatter.formatBookingSuccess({
      paymentMethod: { name: 'كاش', code: 'cash' },
      quotedPrice: '250.00', currency: 'SAR',
    });
    const fractional = formatter.formatBookingSuccess({
      paymentMethod: { name: 'كاش', code: 'cash' },
      quotedPrice: '250.50', currency: 'SAR',
    });
    assert.match(whole, new RegExp(`${LRI}250${PDI} ${LRI}SAR${PDI}`));
    assert.match(fractional, /250.*50.*SAR/u);
    assert.doesNotMatch(`${whole}\n${fractional}`, /SAR 00\.250|00\.250 SAR|00\.250/);
  });
});

describe('central Shaden list formatting', () => {
  test('formats services from authoritative data in compact category blocks', () => {
    const items = [{ name: 'PRP', specialtyName: 'التجميل', isActive: true }, { name: 'فيلر', specialtyName: 'التجميل' }, { name: 'مخفي', isActive: false }, { name: null }];
    const text = formatter.formatServices({ items, clinicName: 'عيادات أوريان' });
    for (const value of ['عيادات أوريان', 'التجميل', 'PRP', 'فيلر']) assert.match(text, new RegExp(value, 'u'));
    assert.match(text, /✨ التجميل[\s\S]*فيلر/u);
    assert.doesNotMatch(text, /\* \*|\*\*|ــــــــ/u);
    assert.ok(text.length < 4096);
    assert.match(formatter.formatServices({ items, clinicName: 'عيادات أوريان', selection: true }), /ما الخدمة التي ترغبين في حجزها/);
  });

  test('groups specialties only through the authoritative specialty id relation', () => {
    const text = formatter.formatSpecialties({
      items: [{ id: 'skin', name: 'الجلدية' }, { id: 'laser', name: 'الليزر' }],
      services: [{ name: 'تنظيف البشرة', specialtyId: 'skin' }, { name: 'إزالة الشعر', specialtyId: 'laser' }],
      clinicName: 'عيادات أوريان',
    });
    assert.match(text, /✨ الجلدية[\s\S]*تنظيف البشرة/u);
    assert.match(text, /✨ الليزر[\s\S]*إزالة الشعر/u);
    assert.doesNotMatch(text, /\* \*|\*\*/u);
  });

  test('renders specialty names only when no authoritative child relation is supplied', () => {
    const text = formatter.formatSpecialties({ items: [{ id: 'skin', name: 'الجلدية' }], services: [{ name: 'غير مرتبط' }] });
    assert.match(text, /• الجلدية/u);
    assert.doesNotMatch(text, /غير مرتبط/u);
  });

  test('formats branches as compact authoritative location cards', () => {
    const text = formatter.formatBranches({ items: [{ name: 'فرع ب', city: 'الرياض' }, { name: 'فرع ج', city: 'جدة' }, { name: 'فرع أ', city: 'الرياض' }] });
    for (const value of ['فرع أ', 'فرع ب', 'فرع ج', 'الرياض', 'جدة']) assert.match(text, new RegExp(value, 'u'));
    assert.match(text, /✨ الرياض[\s\S]*🏥 فرع أ[\s\S]*🏥 فرع ب/u);
    assert.match(text, /✨ جدة[\s\S]*🏥 فرع ج/u);
    assert.doesNotMatch(text, /\* \*|\*\*/u);
  });

  test('shows stored addresses below their branch and omits missing addresses', () => {
    const text = formatter.formatBranches({
      clinicName: 'عيادات أوريان',
      items: [{ name: 'فرع أ', city: 'جدة', address: 'شارع موثق' }, { name: 'فرع ب', city: 'جدة' }],
    });
    assert.match(text, /✨ جدة\n\n‏🏥 فرع أ\n‏شارع موثق\n\n‏🏥 فرع ب/u);
    assert.equal((text.match(/✨ جدة/gu) || []).length, 1);
    assert.doesNotMatch(text, /undefined|null/u);
  });

  test('formats a city-specific branch selection without other cities', () => {
    const text = formatter.formatBranches({ items: [{ name: 'الصالحية', city: 'جدة' }, { name: 'العليا', city: 'الرياض' }], city: 'جدة', selection: true });
    assert.equal(text, [r('📍 *الفروع المتاحة في جدة*'), '', r('• الصالحية'), '', r('ما الفرع المناسب لكِ؟ 🌸')].join('\n'));
    assert.doesNotMatch(text, /الرياض|العليا/);
  });

  test('deduplicates cities and formats booking selection exactly', () => {
    assert.equal(formatter.formatCities({ items: ['جدة', 'الرياض', 'جدة'], selection: true }), [r('🏙️ اختاري المدينة:'), '', r('• الرياض'), r('• جدة'), '', r('في أي مدينة تفضّلين الحجز؟ 🌸')].join('\n'));
  });

  test('keeps payment inquiry separate from payment selection', () => {
    const items = [{ name: 'كاش' }, { name: 'تأمين' }];
    assert.equal(formatter.formatPaymentMethods({ items }), [r('💳 *طرق الدفع المتاحة*'), '', r('• كاش'), r('• تأمين'), '', r('ــــــــــــــــــــ'), '', r('يمكنكِ اختيار الطريقة الأنسب لكِ 🌸')].join('\n'));
    assert.equal(formatter.formatPaymentMethods({ items, selection: true }), [r('💳 *اختاري طريقة الدفع*'), '', r('• كاش'), r('• تأمين'), '', r('ما طريقة الدفع المناسبة لكِ؟ 🌸')].join('\n'));
  });

  test('general grouped inquiries have compact spacing and valid WhatsApp markdown', () => {
    const messages = [
      formatter.formatServices({ items: [{ name: 'ليزر' }] }),
      formatter.formatSpecialties({ items: [{ name: 'الجلدية' }] }),
      formatter.formatBranches({ items: [{ name: 'العليا', city: 'الرياض' }] }),
      formatter.formatCities({ items: ['الرياض'] }),
      formatter.formatPaymentMethods({ items: [{ name: 'كاش' }] }),
    ];
    for (const message of messages) {
      assert.doesNotMatch(message, /\* \*|\*\*/u);
      assert.doesNotMatch(message, /\n{3,}/u);
    }
  });

  test('clinic-information renderers use emoji hierarchy without markdown asterisks', () => {
    const messages = [
      formatter.formatServices({ items: [{ name: 'خدمة', specialtyName: 'تخصص' }], clinicName: 'عيادات الاختبار' }),
      formatter.formatSpecialties({ items: [{ id: 'specialty', name: 'تخصص' }], services: [{ name: 'خدمة', specialtyId: 'specialty' }], clinicName: 'عيادات الاختبار' }),
      formatter.formatBranches({ items: [{ name: 'فرع', city: 'مدينة', address: 'عنوان' }], clinicName: 'عيادات الاختبار' }),
      formatter.formatWorkingHours({ branches: [{ id: 'branch', name: 'فرع', city: 'مدينة' }], workingHours: [{ branchId: 'branch', dayOfWeek: 0, opensAt: '09:00:00', closesAt: '17:00:00', isClosed: false }] }),
      formatter.formatInsuranceCompanies({ items: [{ name: 'شركة' }] }),
    ];
    for (const message of messages) assert.doesNotMatch(message, /\*/u);
  });

  test('collapses identical authoritative branch schedules into one global clinic block', () => {
    const text = formatter.formatWorkingHours({
      branches: [{ id: 'b1', name: 'فرع العليا', city: 'الرياض' }, { id: 'b2', name: 'فرع الروضة', city: 'جدة' }],
      workingHours: [
        { branchId: 'b1', dayOfWeek: 0, opensAt: '10:00', closesAt: '22:00', isClosed: false },
        { branchId: 'b1', dayOfWeek: 5, isClosed: true },
        { branchId: 'b2', dayOfWeek: 0, opensAt: '10:00', closesAt: '22:00', isClosed: false },
        { branchId: 'b2', dayOfWeek: 5, isClosed: true },
      ],
    });
    const visible = text.replace(/[\u2066\u2069]/gu, '');
    for (const value of ['مواعيد العمل', 'الأحد', '10 صباحًا', '10 مساءً', 'الجمعة', 'إجازة']) assert.match(visible, new RegExp(value, 'u'));
    assert.doesNotMatch(visible, /فرع العليا|فرع الروضة/u);
    assert.match(visible, /الأحد\n\n‏?⏰ من 10 صباحًا إلى 10 مساءً\n\n‏?🚫 الجمعة: إجازة/u);
    assert.doesNotMatch(visible, /\n{3,}/u);
    assert.doesNotMatch(text, /\* \*|\*\*|\n{3,}/u);
  });

  test('renders a shared schedule and a branch exception when one branch differs', () => {
    const text = formatter.formatWorkingHours({
      branches: [{ id: 'b1', name: 'العليا', city: 'الرياض' }, { id: 'b2', name: 'الروضة', city: 'جدة' }, { id: 'b3', name: 'الصالحية', city: 'جدة' }],
      workingHours: [
        ...['b1', 'b2'].flatMap((branchId) => [{ branchId, dayOfWeek: 0, opensAt: '10:00', closesAt: '22:00', isClosed: false }, { branchId, dayOfWeek: 5, isClosed: true }]),
        { branchId: 'b3', dayOfWeek: 0, opensAt: '12:00', closesAt: '20:00', isClosed: false }, { branchId: 'b3', dayOfWeek: 5, isClosed: true },
      ],
    }).replace(/[\u2066\u2069]/gu, '');
    assert.match(text, /المواعيد المشتركة/u);
    assert.match(text, /العليا.*الروضة|الروضة.*العليا/u);
    assert.match(text, /الصالحية/u);
    assert.match(text, /10 صباحًا إلى 10 مساءً/u);
    assert.match(text, /12 مساءً إلى 8 مساءً/u);
  });

  test('groups multiple genuinely different schedules by their identical authoritative entries', () => {
    const text = formatter.formatWorkingHours({
      branches: [{ id: 'b1', name: 'أ', city: 'جدة' }, { id: 'b2', name: 'ب', city: 'جدة' }, { id: 'b3', name: 'ج', city: 'الرياض' }, { id: 'b4', name: 'د', city: 'الرياض' }],
      workingHours: [
        ...['b1', 'b2'].flatMap((branchId) => [{ branchId, dayOfWeek: 0, opensAt: '09:00', closesAt: '17:00', isClosed: false }]),
        ...['b3', 'b4'].flatMap((branchId) => [{ branchId, dayOfWeek: 0, opensAt: '11:00', closesAt: '19:00', isClosed: false }]),
      ],
    }).replace(/[\u2066\u2069]/gu, '');
    assert.equal((text.match(/المواعيد المشتركة/gu) || []).length, 2);
    assert.match(text, /أ.*ب|ب.*أ/u);
    assert.match(text, /ج.*د|د.*ج/u);
    assert.match(text, /9 صباحًا إلى 5 مساءً/u);
    assert.match(text, /11 صباحًا إلى 7 مساءً/u);
  });

  test('derives day ranges, holidays, and times entirely from each schedule fixture', () => {
    const branch = [{ id: 'b1', name: 'الفرع', city: 'جدة' }];
    const render = (workingHours) => formatter.formatWorkingHours({ branches: branch, workingHours }).replace(/[\u2066\u2069]/gu, '');
    const noClosedDays = render([0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ branchId: 'b1', dayOfWeek, opensAt: '09:30:00', closesAt: '13:15:00', isClosed: false })));
    assert.doesNotMatch(noClosedDays, /إجازة/u);
    assert.match(noClosedDays, /من السبت إلى الجمعة/u);
    assert.match(noClosedDays, /9:30 صباحًا إلى 1:15 مساءً/u);

    const oneClosedDay = render([6, 0, 1, 2, 3, 4].map((dayOfWeek) => ({ branchId: 'b1', dayOfWeek, opensAt: '10:00:00', closesAt: '22:00:00', isClosed: false })).concat({ branchId: 'b1', dayOfWeek: 5, isClosed: true }));
    assert.match(oneClosedDay, /من السبت إلى الخميس/u);
    assert.match(oneClosedDay, /الجمعة: إجازة/u);

    const multipleClosedDays = render([0, 1, 2, 3, 4].map((dayOfWeek) => ({ branchId: 'b1', dayOfWeek, opensAt: '10:00:00', closesAt: '22:00:00', isClosed: false })).concat([{ branchId: 'b1', dayOfWeek: 5, isClosed: true }, { branchId: 'b1', dayOfWeek: 6, isClosed: true }]));
    assert.match(multipleClosedDays, /من الأحد إلى الخميس/u);
    assert.match(multipleClosedDays, /السبت: إجازة/u);
    assert.match(multipleClosedDays, /الجمعة: إجازة/u);
  });

  test('keeps non-consecutive matching days and weekday hour changes separate', () => {
    const text = formatter.formatWorkingHours({
      branches: [{ id: 'b1', name: 'الفرع', city: 'جدة' }],
      workingHours: [
        { branchId: 'b1', dayOfWeek: 6, opensAt: '09:00:00', closesAt: '17:00:00', isClosed: false },
        { branchId: 'b1', dayOfWeek: 0, opensAt: '10:00:00', closesAt: '18:00:00', isClosed: false },
        { branchId: 'b1', dayOfWeek: 1, opensAt: '09:00:00', closesAt: '17:00:00', isClosed: false },
      ],
    }).replace(/[\u2066\u2069]/gu, '');
    assert.match(text, /السبت[\s\S]*9 صباحًا إلى 5 مساءً/u);
    assert.match(text, /الأحد[\s\S]*10 صباحًا إلى 6 مساءً/u);
    assert.match(text, /الاثنين[\s\S]*9 صباحًا إلى 5 مساءً/u);
    assert.doesNotMatch(text, /من السبت إلى الاثنين/u);
  });

  test('renders the current clinic fixture from its authoritative rows without branch repetition', () => {
    const branches = ['الحمدانية', 'الروضة', 'الصالحية', 'العليا'].map((name, index) => ({ id: `current-${index}`, name: `فرع ${name}`, city: index === 3 ? 'الرياض' : 'جدة' }));
    const workingHours = branches.flatMap((branch) => [6, 0, 1, 2, 3, 4, 5].map((dayOfWeek) => dayOfWeek === 5
      ? { branchId: branch.id, dayOfWeek, isClosed: true }
      : { branchId: branch.id, dayOfWeek, opensAt: '10:00:00', closesAt: '22:00:00', isClosed: false }));
    const text = formatter.formatWorkingHours({ branches, workingHours }).replace(/[\u2066\u2069]/gu, '');
    assert.match(text, /مواعيد العمل/u);
    assert.match(text, /من السبت إلى الخميس/u);
    assert.match(text, /من 10 صباحًا إلى 10 مساءً/u);
    assert.match(text, /الجمعة: إجازة/u);
    for (const branch of branches) assert.doesNotMatch(text, new RegExp(branch.name, 'u'));
  });

  test('booking lists end with only their selection question', () => {
    const messages = [
      formatter.formatServices({ items: [{ name: 'ليزر' }], selection: true }),
      formatter.formatBranches({ items: [{ name: 'العليا', city: 'الرياض' }], city: 'الرياض', selection: true }),
      formatter.formatCities({ items: ['الرياض'], selection: true }),
      formatter.formatPaymentMethods({ items: [{ name: 'كاش' }], selection: true }),
    ];
    for (const message of messages) {
      assert.match(message.split('\n').at(-1), /؟ 🌸$/u);
      assert.doesNotMatch(message, /يسعدني توضيح|يمكنني إرسال|يمكنني مساعدتكِ|الطريقة الأنسب/u);
      assert.doesNotMatch(message, /ــــــــــــــــــــ/u);
    }
  });
});

describe('insurance and clarification formatter coverage', () => {
  const companies = [
    { name: 'بوبا', isActive: true },
    { name: 'التعاونية' },
    { name: 'ميدغلف' },
    { name: 'مخفية', isActive: false },
    { name: null },
    { name: '00000000-0000-4000-8000-000000000001' },
  ];
  const classes = [
    { name: 'A', isAccepted: true, isActive: true },
    { name: 'VIP', isAccepted: true },
    { name: 'C', isAccepted: false },
    { name: undefined },
    { name: '00000000-0000-4000-8000-000000000001', isAccepted: true },
  ];

  test('formats accepted insurance classes exactly for a general inquiry', () => {
    assert.equal(formatter.formatInsuranceClasses({ items: classes }), [
      r('✨ فئات التأمين المقبولة'), '', r(`• ${i('A')}`), r(`• ${i('VIP')}`), '',
      r('────────────'), '', r('يمكنني التحقق من فئة تأمينك 🌸'),
    ].join('\n'));
  });

  test('formats accepted insurance classes exactly during booking', () => {
    const text = formatter.formatInsuranceClasses({ items: classes, selection: true });
    assert.equal(text, [
      r('✨ اختاري فئة التأمين'), '', r(`• ${i('A')}`), r(`• ${i('VIP')}`), '',
      r('────────────'), '', r('ما فئة التأمين الخاصة بكِ؟ 🌸'),
    ].join('\n'));
    assert.equal((text.match(/────────────/gu) || []).length, 1);
    assert.doesNotMatch(text, /يمكنني التحقق|\bC\b|null|undefined|00000000/u);
  });

  test('formats insurance companies exactly for a general inquiry', () => {
    assert.equal(formatter.formatInsuranceCompanies({ items: companies }), [
      r('🛡️ شركات التأمين المعتمدة'), '', r('• بوبا'), r('• التعاونية'), r('• ميدغلف'), '',
      r('────────────'), '', r('🌸 يسعدنا التحقق من التغطية المناسبة لخدمتك'),
    ].join('\n'));
  });

  test('formats insurance companies exactly during booking', () => {
    const text = formatter.formatInsuranceCompanies({ items: companies, selection: true });
    assert.equal(text, [
      r('🛡️ اختاري شركة التأمين'), '', r('• بوبا'), r('• التعاونية'), r('• ميدغلف'), '',
      r('────────────'), '', r('ما شركة التأمين الخاصة بكِ؟ 🌸'),
    ].join('\n'));
    assert.equal((text.match(/────────────/gu) || []).length, 1);
    assert.doesNotMatch(text, /يمكنني التحقق|null|undefined|00000000/u);
  });

  test('formats the general fallback exactly with centralized capabilities', () => {
    assert.equal(formatter.formatUnknown(), [
      r('🌸 *لم أفهم طلبك بالكامل*'), '', r('يمكنني مساعدتك في:'), '',
      r('• الخدمات'), r('• الفروع'), r('• مواعيد العمل'), r('• التأمين'), r('• طرق الدفع'), '',
      r('────────────'), '', r('اكتبي طلبك بطريقة أخرى وسأساعدكِ.'),
    ].join('\n'));
  });

  test('formats contextual time clarification without the general capability list', () => {
    const text = formatter.formatBookingClarification({ kind: 'ambiguous_time' });
    assert.equal(text, [
      r('🌸 *لم أتمكن من تحديد الوقت*'), '',
      r('اكتبي الوقت مع توضيح صباحًا أو مساءً، مثل:'),
      `\`${i('11')} ص\` أو \`${i('6')} م\``,
    ].join('\n'));
    assert.doesNotMatch(text, /الخدمات|الفروع|طرق الدفع/u);
  });

  test('every insurance list has one visible line after its final item and one ending', () => {
    for (const text of [
      formatter.formatInsuranceClasses({ items: classes }),
      formatter.formatInsuranceClasses({ items: classes, selection: true }),
      formatter.formatInsuranceCompanies({ items: companies }),
      formatter.formatInsuranceCompanies({ items: companies, selection: true }),
    ]) {
      assert.equal((text.match(/────────────/gu) || []).length, 1);
      assert.match(text, /• .+\n\n‏────────────\n\n‏.+$/u);
      assert.doesNotMatch(text, /🌸[\s\S]+🌸/u);
    }
  });
});

describe('booking insurance, persisted status, and official reference', () => {
  test('pending insurance summary includes verified company and class', () => {
    const text = formatter.formatBookingSummary({
      service: optionalService,
      branch,
      dateText: 'الأربعاء، ٥ أغسطس ٢٠٢٦',
      timeText: '١١:٠٠ ص',
      paymentMethod: { name: 'تأمين' },
      insuranceCompany: { name: 'بوبا' },
      insuranceClass: { name: 'A' },
    });
    assert.match(text, /\*طريقة الدفع:\* تأمين/u);
    assert.match(text, /\*شركة التأمين:\* بوبا/u);
    assert.match(text, new RegExp(`\\*الفئة:\\* ${LRI}A${PDI}`));
  });

  test('cash summary never displays insurance details', () => {
    const text = formatter.formatBookingSummary({
      service: optionalService,
      paymentMethod: { name: 'كاش' },
      insuranceCompany: { name: 'يجب تجاهلها' },
      insuranceClass: { name: 'VIP' },
    });
    assert.doesNotMatch(text, /شركة التأمين|فئة التأمين/u);
  });

  test('pending success omits the duplicated completion summary', () => {
    const text = formatter.formatBookingSuccess({
      service: requiredService,
      branch,
      doctor: { name: 'د. آلاء أيمن' },
      room: { number: '102', name: 'غرفة ليزر 2' },
      dateText: 'الأربعاء، ٥ أغسطس ٢٠٢٦',
      timeText: '١١:٠٠ ص',
      paymentMethod: { name: 'تأمين' },
      insuranceCompany: { name: 'بوبا' },
      insuranceClass: { name: 'VIP' },
      bookingReference: '25DD4527',
      appointmentStatus: 'pending',
    });
    assert.match(text, /تم تسجيل طلب حجزك بنجاح/u);
    assert.match(text, /طلبك بانتظار تأكيد العيادة/u);
    assert.match(text, /ستصلك رسالة منفصلة بعد التأكيد/u);
    assert.doesNotMatch(text, /شركة التأمين|فئة التأمين|25DD4527/u);
    assert.doesNotMatch(text, /تم تأكيد حجزك|[0-9a-f]{8}-[0-9a-f]{4}-/iu);
  });

  test('confirmed success uses confirmed wording without mutating status', () => {
    const appointment = { status: 'confirmed' };
    const text = formatter.formatBookingSuccess({ appointmentStatus: appointment.status });
    assert.match(text, /تم تأكيد حجزك بنجاح/u);
    assert.equal(appointment.status, 'confirmed');
  });
});
