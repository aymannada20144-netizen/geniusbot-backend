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
  test('formats the confirmation summary exactly for a doctor-and-room service', () => {
    assert.equal(formatter.formatBookingSummary({ service: requiredService, branch, doctor: { name: 'د. علياء' }, room: { number: '102', name: 'غرفة ليزر' }, dateText: 'الأحد، ٢ أغسطس ٢٠٢٦', timeText: '١١:٠٠ ص', paymentMethod: { name: 'كاش' } }), [
      r('📋 *راجعي تفاصيل حجزك*'), '', r('*الخدمة والفرع*'), r('*الخدمة:* إزالة الشعر بالليزر'), r('*الفرع:* جدة — فرع الصالحية'), '',
      r('*تفاصيل الزيارة*'), r('*الطبيب:* د. علياء'), r(`*الغرفة:* ${i('102')} — غرفة ليزر`), '', r('*الموعد*'), r('*التاريخ:* الأحد، ٢ أغسطس ٢٠٢٦'),
      r('*الوقت:* ١١:٠٠ ص'), '', r('*الدفع*'), r('*طريقة الدفع:* كاش'), '', r('ــــــــــــــــــــ'), '', r('هل بيانات الحجز صحيحة؟'), '', r('اكتبي *نعم* للتأكيد أو *إلغاء*.'),
    ].join('\n'));
  });

  test('formats success exactly, preserves full reference, and isolates it', () => {
    assert.equal(formatter.formatBookingSuccess({ service: requiredService, branch, doctor: { name: 'د. علياء' }, room: { number: '102', name: 'غرفة ليزر' }, dateText: 'الأحد، ٢ أغسطس ٢٠٢٦', timeText: '١١:٠٠ ص', paymentMethod: { name: 'كاش' }, bookingReference: 'appointment-100' }), [
      r('✅ *تم تأكيد حجزك بنجاح*'), '', r('*الخدمة والفرع*'), r('*الخدمة:* إزالة الشعر بالليزر'), r('*الفرع:* جدة — فرع الصالحية'), '',
      r('*تفاصيل الزيارة*'), r('*الطبيب:* د. علياء'), r(`*الغرفة:* ${i('102')} — غرفة ليزر`), '', r('*الموعد*'), r('*التاريخ:* الأحد، ٢ أغسطس ٢٠٢٦'),
      r('*الوقت:* ١١:٠٠ ص'), '', r('*طريقة الدفع*'), r('كاش'), '', r('────────────'), '', r('🎫 *رقم الحجز*'), `\`${i('appointment-100')}\``, '', r('ننتظرك في الموعد 🌸'),
    ].join('\n'));
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
    assert.match(whole, new RegExp(`${LRI}250${PDI} ريال`));
    assert.match(fractional, new RegExp(`${LRI}250\\.50${PDI} ريال`));
    assert.doesNotMatch(`${whole}\n${fractional}`, /SAR 00\.250|00\.250 SAR|00\.250/);
  });
});

describe('central Shaden list formatting', () => {
  test('formats services from supplied data, with clinic name and booking-only question', () => {
    const items = [{ name: 'PRP', isActive: true }, { name: 'فيلر' }, { name: 'مخفي', isActive: false }, { name: null }];
    assert.equal(formatter.formatServices({ items, clinicName: 'عيادات أوريان' }), [r('✨ *الخدمات المتاحة في عيادات أوريان*'), '', r('يمكنكِ اختيار إحدى الخدمات التالية:'), '', r(`▪️ ${i('PRP')}`), r('▪️ فيلر'), '', r('ــــــــــــــــــــ'), '', r('يسعدني توضيح أي خدمة منها 🌸')].join('\n'));
    assert.doesNotMatch(formatter.formatServices({ items, clinicName: 'عيادات أوريان' }), /ما الخدمة/);
    assert.match(formatter.formatServices({ items, clinicName: 'عيادات أوريان', selection: true }), /ما الخدمة التي ترغبين في حجزها/);
  });

  test('formats specialties exactly with the dynamic clinic name', () => {
    assert.equal(formatter.formatSpecialties({ items: [{ name: 'الجلدية' }], clinicName: 'عيادات أوريان' }), [r('🩺 *التخصصات المتاحة في عيادات أوريان*'), '', r('▪️ الجلدية'), '', r('ــــــــــــــــــــ'), '', r('يسعدني توضيح أي تخصص منها 🌸')].join('\n'));
  });

  test('groups branches by city in deterministic order', () => {
    const text = formatter.formatBranches({ items: [{ name: 'فرع ب', city: 'الرياض' }, { name: 'فرع ج', city: 'جدة' }, { name: 'فرع أ', city: 'الرياض' }] });
    assert.equal(text, [r('📍 *فروعنا المتاحة*'), '', r('*الرياض*'), r('▪️ فرع أ'), r('▪️ فرع ب'), '', r('*جدة*'), r('▪️ فرع ج'), '', r('ــــــــــــــــــــ'), '', r('يمكنني إرسال عنوان أي فرع تختارينه 🌸')].join('\n'));
  });

  test('formats a city-specific branch selection without other cities', () => {
    const text = formatter.formatBranches({ items: [{ name: 'الصالحية', city: 'جدة' }, { name: 'العليا', city: 'الرياض' }], city: 'جدة', selection: true });
    assert.equal(text, [r('📍 *الفروع المتاحة في جدة*'), '', r('▪️ الصالحية'), '', r('ما الفرع المناسب لكِ؟ 🌸')].join('\n'));
    assert.doesNotMatch(text, /الرياض|العليا/);
  });

  test('deduplicates cities and formats booking selection exactly', () => {
    assert.equal(formatter.formatCities({ items: ['جدة', 'الرياض', 'جدة'], selection: true }), [r('🏙️ اختاري المدينة:'), '', r('▪️ الرياض'), r('▪️ جدة'), '', r('في أي مدينة تفضّلين الحجز؟ 🌸')].join('\n'));
  });

  test('keeps payment inquiry separate from payment selection', () => {
    const items = [{ name: 'كاش' }, { name: 'تأمين' }];
    assert.equal(formatter.formatPaymentMethods({ items }), [r('💳 *طرق الدفع المتاحة*'), '', r('▪️ كاش'), r('▪️ تأمين'), '', r('ــــــــــــــــــــ'), '', r('يمكنكِ اختيار الطريقة الأنسب لكِ 🌸')].join('\n'));
    assert.equal(formatter.formatPaymentMethods({ items, selection: true }), [r('💳 *اختاري طريقة الدفع*'), '', r('▪️ كاش'), r('▪️ تأمين'), '', r('ما طريقة الدفع المناسبة لكِ؟ 🌸')].join('\n'));
  });

  test('general inquiries keep a visible line after the last list item', () => {
    const messages = [
      formatter.formatServices({ items: [{ name: 'ليزر' }] }),
      formatter.formatSpecialties({ items: [{ name: 'الجلدية' }] }),
      formatter.formatBranches({ items: [{ name: 'العليا', city: 'الرياض' }] }),
      formatter.formatCities({ items: ['الرياض'] }),
      formatter.formatPaymentMethods({ items: [{ name: 'كاش' }] }),
    ];
    for (const message of messages) {
      assert.doesNotMatch(message.split('\n').at(-1), /^‏?▪️/u);
      assert.match(message, /▪️ .+\n\n‏ــــــــــــــــــــ\n\n‏.+🌸$/u);
    }
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
      r('✨ *فئات التأمين المقبولة*'), '', r(`▪️ ${i('A')}`), r(`▪️ ${i('VIP')}`), '',
      r('────────────'), '', r('يمكنني التحقق من فئة تأمينك 🌸'),
    ].join('\n'));
  });

  test('formats accepted insurance classes exactly during booking', () => {
    const text = formatter.formatInsuranceClasses({ items: classes, selection: true });
    assert.equal(text, [
      r('✨ *اختاري فئة التأمين*'), '', r(`▪️ ${i('A')}`), r(`▪️ ${i('VIP')}`), '',
      r('────────────'), '', r('ما فئة التأمين الخاصة بكِ؟ 🌸'),
    ].join('\n'));
    assert.equal((text.match(/────────────/gu) || []).length, 1);
    assert.doesNotMatch(text, /يمكنني التحقق|\bC\b|null|undefined|00000000/u);
  });

  test('formats insurance companies exactly for a general inquiry', () => {
    assert.equal(formatter.formatInsuranceCompanies({ items: companies }), [
      r('🛡️ *شركات التأمين المعتمدة*'), '', r('▪️ بوبا'), r('▪️ التعاونية'), r('▪️ ميدغلف'), '',
      r('────────────'), '', r('يمكنني التحقق من شركة تأمينك 🌸'),
    ].join('\n'));
  });

  test('formats insurance companies exactly during booking', () => {
    const text = formatter.formatInsuranceCompanies({ items: companies, selection: true });
    assert.equal(text, [
      r('🛡️ *اختاري شركة التأمين*'), '', r('▪️ بوبا'), r('▪️ التعاونية'), r('▪️ ميدغلف'), '',
      r('────────────'), '', r('ما شركة التأمين الخاصة بكِ؟ 🌸'),
    ].join('\n'));
    assert.equal((text.match(/────────────/gu) || []).length, 1);
    assert.doesNotMatch(text, /يمكنني التحقق|null|undefined|00000000/u);
  });

  test('formats the general fallback exactly with centralized capabilities', () => {
    assert.equal(formatter.formatUnknown(), [
      r('🌸 *لم أفهم طلبك بالكامل*'), '', r('يمكنني مساعدتك في:'), '',
      r('▪️ الخدمات'), r('▪️ الفروع'), r('▪️ مواعيد العمل'), r('▪️ التأمين'), r('▪️ طرق الدفع'), '',
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
      assert.match(text, /▪️ .+\n\n‏────────────\n\n‏.+$/u);
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
    assert.match(text, new RegExp(`فئة التأمين:\\* ${LRI}A${PDI}`));
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
