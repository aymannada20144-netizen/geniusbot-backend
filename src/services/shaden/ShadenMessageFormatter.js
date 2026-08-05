'use strict';

const RLM = '\u200F';
const LRI = '\u2066';
const PDI = '\u2069';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIVIDER = 'ــــــــــــــــــــ';
const LIST_DIVIDER = '────────────';
const SUPPORTED_CAPABILITIES = Object.freeze(['الخدمات', 'الفروع', 'مواعيد العمل', 'التأمين', 'طرق الدفع']);

function formatServices({ items, clinicName, selection = false } = {}) {
  const title = clinicTitle('✨', 'الخدمات المتاحة', clinicName);
  const values = displayItems(items);
  const lines = [title, ''];
  if (values.length) {
    lines.push(rtl('يمكنكِ اختيار إحدى الخدمات التالية:'), '', ...values.map(listItem));
  } else {
    lines.push(rtl('لا توجد خدمات نشطة متاحة حاليًا.'));
  }
  if (values.length) appendListEnding(lines, selection, 'ما الخدمة التي ترغبين في حجزها؟ 🌸', 'يسعدني توضيح أي خدمة منها 🌸');
  return lines.join('\n');
}

function formatSpecialties({ items, clinicName } = {}) {
  const lines = [clinicTitle('🩺', 'التخصصات المتاحة', clinicName), ''];
  const values = displayItems(items);
  lines.push(...(values.length ? values.map(listItem) : [rtl('لا توجد تخصصات نشطة متاحة حاليًا.')]))
  if (values.length) appendGeneralListFooter(lines, 'يسعدني توضيح أي تخصص منها 🌸');
  return lines.join('\n');
}

function formatBranches({ items, city = null, selection = false } = {}) {
  const branches = activeItems(items).filter((branch) => cleanValue(branch?.name) && cleanValue(branch?.city));
  const normalizedCity = normalizeKey(city);
  const selected = normalizedCity
    ? branches.filter((branch) => normalizeKey(branch.city) === normalizedCity)
    : branches;
  if (!selected.length) return formatNoActiveBranches(city);
  if (normalizedCity) {
    const cityName = cleanValue(selected[0].city);
    const lines = [rtl(`📍 *الفروع المتاحة في ${bidi(cityName)}*`), '', ...sortNames(selected.map((branch) => cleanBranchName(branch.name))).map(listItem)];
    appendListEnding(lines, selection, 'ما الفرع المناسب لكِ؟ 🌸', 'يمكنني إرسال عنوان أي فرع تختارينه 🌸');
    return lines.join('\n');
  }
  const groups = new Map();
  for (const branch of selected) {
    const cityName = cleanValue(branch.city);
    const key = normalizeKey(cityName);
    if (!groups.has(key)) groups.set(key, { city: cityName, names: [] });
    groups.get(key).names.push(cleanBranchName(branch.name));
  }
  const lines = [rtl('📍 *فروعنا المتاحة*')];
  const ordered = [...groups.values()].sort((left, right) => compareArabic(left.city, right.city));
  for (const group of ordered) {
    lines.push('', rtl(`*${bidi(group.city)}*`), ...sortNames(group.names).map(listItem));
  }
  appendGeneralListFooter(lines, 'يمكنني إرسال عنوان أي فرع تختارينه 🌸');
  return lines.join('\n');
}

function formatCities({ items, selection = false } = {}) {
  const unique = new Map();
  for (const item of activeItems(items)) {
    const city = cleanValue(typeof item === 'string' ? item : item?.city || item?.name);
    if (city && !unique.has(normalizeKey(city))) unique.set(normalizeKey(city), city);
  }
  const values = sortNames([...unique.values()]);
  const lines = [rtl('🏙️ اختاري المدينة:'), '', ...(values.length ? values.map(listItem) : [rtl('لا توجد مدن متاحة للحجز حاليًا.')])];
  if (values.length) appendListEnding(lines, selection, 'في أي مدينة تفضّلين الحجز؟ 🌸', 'يمكنني مساعدتكِ في اختيار المدينة المناسبة 🌸');
  return lines.join('\n');
}

function formatPaymentMethods({ items, selection = false } = {}) {
  const values = displayItems(items);
  const lines = [rtl(selection ? '💳 *اختاري طريقة الدفع*' : '💳 *طرق الدفع المتاحة*'), '', ...(values.length ? values.map(listItem) : [rtl('لا توجد طرق دفع نشطة متاحة حاليًا.')])];
  if (values.length) appendListEnding(lines, selection, 'ما طريقة الدفع المناسبة لكِ؟ 🌸', 'يمكنكِ اختيار الطريقة الأنسب لكِ 🌸');
  return lines.join('\n');
}

function formatInsuranceCompanies({ items, selection = false } = {}) {
  return formatSimpleList({
    icon: '🛡️',
    title: selection ? 'اختاري شركة التأمين' : 'شركات التأمين المعتمدة',
    items,
    selection,
    question: 'ما شركة التأمين الخاصة بكِ؟ 🌸',
    footer: 'يمكنني التحقق من شركة تأمينك 🌸',
  });
}

function formatInsuranceClasses({ items, selection = false } = {}) {
  const accepted = activeItems(items).filter((item) => item?.isAccepted !== false && item?.is_accepted !== false);
  return formatSimpleList({
    icon: '✨',
    title: selection ? 'اختاري فئة التأمين' : 'فئات التأمين المقبولة',
    items: accepted,
    selection,
    question: 'ما فئة التأمين الخاصة بكِ؟ 🌸',
    footer: 'يمكنني التحقق من فئة تأمينك 🌸',
  });
}

function formatUnknown() {
  return [
    rtl('🌸 *لم أفهم طلبك بالكامل*'),
    '',
    rtl('يمكنني مساعدتك في:'),
    '',
    ...SUPPORTED_CAPABILITIES.map(listItem),
    '',
    rtl(LIST_DIVIDER),
    '',
    rtl('اكتبي طلبك بطريقة أخرى وسأساعدكِ.'),
  ].join('\n');
}

function formatBookingClarification({ kind } = {}) {
  if (kind === 'ambiguous_time') {
    return [
      rtl('🌸 *لم أتمكن من تحديد الوقت*'),
      '',
      rtl('اكتبي الوقت مع توضيح صباحًا أو مساءً، مثل:'),
      `\`${LRI}11${PDI} ص\` أو \`${LRI}6${PDI} م\``,
    ].join('\n');
  }
  if (kind === 'time') return [rtl('🌸 *لم أتمكن من تحديد الوقت*'), '', rtl('ما الوقت المناسب لكِ في هذا التاريخ؟ 🌸')].join('\n');
  if (kind === 'date') return [rtl('🌸 *لم أتمكن من تحديد التاريخ*'), '', rtl('ما التاريخ المناسب لكِ في هذا الوقت؟ 🌸')].join('\n');
  return [rtl('🌸 *لم أتمكن من تحديد الموعد*'), '', rtl('ما التاريخ والوقت المناسبان لكِ؟ 🌸')].join('\n');
}

function formatInlineListItem(value) {
  const clean = cleanValue(value);
  return clean ? listItem(clean) : '';
}

function formatSimpleList({ icon, title, items, selection, question, footer }) {
  const values = [...new Map(displayItems(items).map((value) => [normalizeKey(value), value])).values()];
  const lines = [rtl(`${icon} *${title}*`), '', ...(values.length ? values.map(listItem) : [rtl('لا توجد عناصر نشطة متاحة حاليًا.')])];
  if (values.length) lines.push('', rtl(LIST_DIVIDER), '', rtl(selection ? question : footer));
  return lines.join('\n');
}

function formatBookingSummary(input = {}) {
  const sections = [];
  addSection(sections, 'الخدمة والفرع', [field('الخدمة', input.service?.name), field('الفرع', branchWithCity(input.branch))]);
  addSection(sections, 'تفاصيل الزيارة', resourceFields(input));
  addSection(sections, 'الموعد', [field('التاريخ', input.dateText), field('الوقت', input.timeText)]);
  addSection(sections, 'الدفع', paymentFields(input, false));
  return [rtl('📋 *راجعي تفاصيل حجزك*'), '', ...joinSections(sections), '', rtl(DIVIDER), '', rtl('هل بيانات الحجز صحيحة؟'), '', rtl('اكتبي *نعم* للتأكيد أو *إلغاء*.')].join('\n');
}

function formatBookingSuccess(input = {}) {
  const pending = cleanValue(input.appointmentStatus) === 'pending';
  if (pending) {
    return [
      rtl('✅ تم تسجيل طلب حجزك بنجاح'),
      '',
      rtl('طلبك بانتظار تأكيد العيادة، وستصلك رسالة منفصلة بعد التأكيد 🌸'),
    ].join('\n');
  }

  const sections = [];
  addSection(sections, null, [
    field('الاسم', input.customerName),
  ]);
  addSection(sections, 'الخدمة والفرع', [field('الخدمة', input.service?.name), field('الفرع', branchWithCity(input.branch))]);
  addSection(sections, 'تفاصيل الزيارة', resourceFields(input, true));
  addSection(sections, 'الموعد', [field('التاريخ', input.dateText), field('الوقت', input.timeText)]);
  addSection(sections, 'طريقة الدفع', paymentFields(input, true));
  const title = '✅ *تم تأكيد حجزك بنجاح*';
  const ending = 'ننتظرك في الموعد 🌸';
  const lines = [rtl(title), '', ...joinSections(sections)];
  const reference = cleanValue(input.bookingReference);
  if (reference) lines.push('', rtl(LIST_DIVIDER), '', rtl('🎫 *رقم الحجز*'), `\`${LRI}${reference}${PDI}\``);
  lines.push('', rtl(ending));
  return lines.join('\n');
}

function formatNoActiveBranches(city) {
  const value = cleanValue(city);
  return rtl(value
    ? `لا توجد لدينا فروع نشطة في ${bidi(value)} حاليًا. 🌸`
    : 'لا توجد لدينا فروع نشطة في هذه المدينة حاليًا. 🌸');
}

function paymentFields(input, standaloneMethod) {
  const values = [standaloneMethod ? standalone(input.paymentMethod?.name) : field('طريقة الدفع', input.paymentMethod?.name)];
  if (isInsurancePayment(input.paymentMethod)) {
    if (input.insuranceCompany) values.push(field('شركة التأمين', input.insuranceCompany?.name));
    if (input.insuranceClass) values.push(field('فئة التأمين', input.insuranceClass?.name));
  }
  const price = priceField(input.quotedPrice, input.currency);
  if (price) values.push(price);
  return values;
}

function isInsurancePayment(paymentMethod) {
  const value = normalizeKey(`${paymentMethod?.code || ''} ${paymentMethod?.name || ''}`);
  return value.includes('insurance') || value.includes('تامين');
}

function resourceFields(input, includeAssigned = false) {
  const fields = [];
  if (input.service?.requiresDoctor === true || (includeAssigned && personName(input.doctor))) {
    fields.push(field('الطبيب', personName(input.doctor)));
  }
  if (input.service?.requiresRoom === true || (includeAssigned && roomLabel(input.room))) {
    fields.push(field('الغرفة', roomLabel(input.room)));
  }
  return fields;
}

function addSection(sections, title, lines) {
  const clean = lines.filter(Boolean);
  if (clean.length) sections.push(title ? [rtl(`*${title}*`), ...clean] : clean);
}

function joinSections(sections) {
  return sections.flatMap((section, index) => index === 0 ? section : ['', ...section]);
}

function appendListEnding(lines, selection, question, footer) {
  if (selection) lines.push('', rtl(question));
  else appendGeneralListFooter(lines, footer);
}

function appendGeneralListFooter(lines, footer) {
  lines.push('', rtl(DIVIDER), '', rtl(footer));
}

function field(label, value) {
  const clean = cleanValue(value);
  return clean ? rtl(`*${label}:* ${bidi(clean)}`) : null;
}

function standalone(value) {
  const clean = cleanValue(value);
  return clean ? rtl(bidi(clean)) : null;
}

function clinicTitle(icon, title, clinicName) {
  const clinic = cleanValue(clinicName);
  return rtl(`${icon} *${title}${clinic ? ` في ${bidi(clinic)}` : ''}*`);
}

function displayItems(items) {
  return activeItems(items).map((item) => cleanValue(typeof item === 'string' ? item : item?.name)).filter(Boolean);
}

function activeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.isActive !== false && item?.is_active !== false);
}

function listItem(value) { return rtl(`▪️ ${bidi(value)}`); }
function rtl(value) { return `${RLM}${value}`; }

function bidi(value) {
  return String(value).replace(/[A-Za-z][A-Za-z0-9/._-]*|[0-9]+/g, (token) => `${LRI}${token}${PDI}`);
}

function branchWithCity(branch) {
  const name = cleanValue(branch?.name);
  const city = cleanValue(branch?.city);
  if (name && city && normalizeKey(name).includes(normalizeKey(city))) return name;
  return city && name ? `${city} — ${name}` : city || name;
}

function cleanBranchName(value) {
  return cleanValue(value)?.replace(/^.*?—\s*/u, '').trim() || null;
}

function personName(person) { return cleanValue(person?.name || person?.full_name); }

function roomLabel(room) {
  const number = cleanValue(room?.number);
  const name = cleanValue(room?.name);
  if (!number) return name;
  return name ? `${number} — ${name}` : number;
}

function priceField(price, currency) {
  const amount = normalizedDecimal(price);
  if (!amount) return null;
  const code = cleanValue(currency);
  const unit = !code || code.toUpperCase() === 'SAR'
    ? 'ريال'
    : `${LRI}${code.toUpperCase()}${PDI}`;
  return rtl(`*السعر:* ${LRI}${amount}${PDI} ${unit}`);
}

function normalizedDecimal(value) {
  const raw = cleanValue(value);
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [integerPart, fraction = ''] = raw.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '') || '0';
  return fraction && !/^0+$/.test(fraction)
    ? `${integer}.${fraction}`
    : integer;
}

function cleanValue(value) {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  if (!clean || UUID_PATTERN.test(clean) || /^(null|undefined)$/i.test(clean)) return null;
  return clean;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064b-\u065f]/g, '').replace(/\s+/g, ' ');
}

function sortNames(values) { return values.filter(Boolean).sort(compareArabic); }
function compareArabic(left, right) { return String(left).localeCompare(String(right), 'ar'); }

module.exports = {
  formatServices,
  formatSpecialties,
  formatBranches,
  formatCities,
  formatPaymentMethods,
  formatInsuranceCompanies,
  formatInsuranceClasses,
  formatUnknown,
  formatBookingClarification,
  formatInlineListItem,
  formatBookingSummary,
  formatBookingSuccess,
  formatNoActiveBranches,
  controls: Object.freeze({ RLM, LRI, PDI }),
};
