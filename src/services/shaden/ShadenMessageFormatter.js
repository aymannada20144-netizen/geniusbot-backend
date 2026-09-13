'use strict';

const RLM = '\u200F';
const LRI = '\u2066';
const PDI = '\u2069';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIVIDER = 'ــــــــــــــــــــ';
const LIST_DIVIDER = '────────────';
const SUPPORTED_CAPABILITIES = Object.freeze(['الخدمات', 'الفروع', 'مواعيد العمل', 'التأمين', 'طرق الدفع']);
// Database day_of_week convention: 0=Sunday … 6=Saturday.
const DAY_ORDER = Object.freeze([6, 0, 1, 2, 3, 4, 5]);

function formatServices({ items, clinicName, selection = false } = {}) {
  if (!selection) return formatServicesOverview({ items, clinicName });
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

function formatServicesOverview({ items, clinicName } = {}) {
  const services = activeItems(items).filter((item) => cleanValue(item?.name));
  const lines = [plainClinicTitle('🌸', 'الخدمات المتاحة', clinicName), ''];
  if (!services.length) return [...lines, rtl('لا توجد خدمات نشطة متاحة حاليًا.')].join('\n');
  const bySpecialty = new Map();
  for (const service of services) {
    const specialty = cleanValue(service.specialtyName);
    const key = normalizeKey(specialty || 'other');
    if (!bySpecialty.has(key)) bySpecialty.set(key, { specialty, names: [] });
    bySpecialty.get(key).names.push(cleanValue(service.name));
  }
  const groups = [...bySpecialty.values()].sort((left, right) => compareArabic(left.specialty || '', right.specialty || ''));
  for (const [index, group] of groups.entries()) {
    if (index > 0) lines.push('');
    if (group.specialty) lines.push(rtl(`✨ ${bidi(group.specialty)}`));
    lines.push(...sortNames(group.names).map((name) => rtl(bidi(name))));
  }
  lines.push('', rtl('🌸 هل ترغبين بمعرفة تفاصيل خدمة معينة أو توفرها في أحد الفروع؟'));
  return lines.join('\n');
}

function formatSpecialties({ items, services = [], clinicName } = {}) {
  const values = activeItems(items).filter((item) => cleanValue(item?.name));
  const lines = [plainClinicTitle('🩺', 'تخصصات', clinicName), ''];
  if (!values.length) return [...lines, rtl('لا توجد تخصصات نشطة متاحة حاليًا.')].join('\n');
  const serviceItems = activeItems(services).filter((service) => cleanValue(service?.name));
  const servicesBySpecialtyId = new Map();
  for (const service of serviceItems) {
    if (!service.specialtyId) continue;
    const key = String(service.specialtyId);
    const names = servicesBySpecialtyId.get(key) || [];
    names.push(cleanValue(service.name));
    servicesBySpecialtyId.set(key, names);
  }
  const hasAuthoritativeChildren = values.some((item) => servicesBySpecialtyId.has(String(item.id)));
  if (!hasAuthoritativeChildren) return [...lines, ...sortNames(values.map((item) => cleanValue(item.name))).map((name) => rtl(`✨ ${bidi(name)}`)), '', rtl('🌸 هل ترغبين بمعرفة الخدمات المتاحة في تخصص معين؟')].join('\n');
  for (const [index, item] of values.sort((left, right) => compareArabic(left.name, right.name)).entries()) {
    if (index > 0) lines.push('');
    lines.push(rtl(`✨ ${bidi(cleanValue(item.name))}`));
    const children = servicesBySpecialtyId.get(String(item.id)) || [];
    if (children.length) lines.push(...sortNames(children).map((name) => rtl(bidi(name))));
  }
  lines.push('', rtl('🌸 هل ترغبين بمعرفة الخدمات المتاحة في تخصص معين؟'));
  return lines.join('\n');
}

function formatBranches({ items, city = null, selection = false, clinicName = null } = {}) {
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
  const byCity = new Map();
  for (const branch of selected) {
    const cityName = cleanValue(branch.city);
    const group = byCity.get(normalizeKey(cityName)) || { cityName, branches: [] };
    group.branches.push(branch);
    byCity.set(normalizeKey(cityName), group);
  }
  const clinic = cleanValue(clinicName);
  const lines = [rtl(`📍 فروع${clinic ? ` ${bidi(clinic)}` : 'نا'}`), ''];
  for (const [index, group] of [...byCity.values()].sort((left, right) => compareArabic(left.cityName, right.cityName)).entries()) {
    if (index > 0) lines.push('');
    lines.push(rtl(`✨ ${bidi(group.cityName)}`), '');
    for (const [branchIndex, branch] of group.branches.sort((left, right) => compareArabic(left.name, right.name)).entries()) {
      if (branchIndex > 0) lines.push('');
      lines.push(rtl(`🏥 ${bidi(cleanBranchName(branch.name))}`));
      const address = cleanValue(branch.address);
      if (address) lines.push(rtl(bidi(address)));
    }
  }
  lines.push('', rtl('🌸 يسعدنا زيارتك في الفرع الأنسب لك'));
  return compactLines(lines).join('\n');
}

function formatWorkingHours({ branches, workingHours, city = null } = {}) {
  const branchById = new Map(activeItems(branches).map((branch) => [String(branch.id), branch]));
  const schedules = new Map();
  for (const entry of Array.isArray(workingHours) ? workingHours : []) {
    const branch = branchById.get(String(entry.branchId));
    if (!branch || (city && normalizeKey(branch.city) !== normalizeKey(city))) continue;
    const values = schedules.get(String(branch.id)) || { branch, entriesByDay: new Map() };
    const normalized = normalizeWorkingHoursEntry(entry);
    if (!normalized) continue;
    // The database has a unique (branch_id, day_of_week) constraint. Keeping
    // one normalized value also prevents a malformed read from duplicating a day.
    if (!values.entriesByDay.has(normalized.dayOfWeek)) values.entriesByDay.set(normalized.dayOfWeek, normalized);
    schedules.set(String(branch.id), values);
  }
  if (!schedules.size) return rtl(city ? `لا يوجد لدينا فروع في ${bidi(city)} حاليًا. 🌸` : 'مواعيد العمل غير مسجلة حاليًا. 🌸');
  const groups = new Map();
  for (const schedule of schedules.values()) {
    const entries = DAY_ORDER.map((day) => schedule.entriesByDay.get(day)).filter(Boolean);
    const key = entries.map((entry) => `${entry.dayOfWeek}|${entry.isClosed}|${entry.opensAt || ''}|${entry.closesAt || ''}`).join(';');
    const group = groups.get(key) || { entries, branches: [] };
    group.branches.push(schedule.branch);
    groups.set(key, group);
  }
  const lines = [rtl(city ? `🕐 مواعيد العمل في ${bidi(city)}` : '🕐 مواعيد العمل'), ''];
  if (groups.size === 1) {
    appendSchedule(lines, groups.values().next().value.entries);
    lines.push('', rtl('🌸 يسعدنا استقبالكم في الأوقات المناسبة لكم'));
    return compactLines(lines).join('\n');
  }
  const ordered = [...groups.values()].sort((left, right) => right.branches.length - left.branches.length || compareArabic(left.branches[0].name, right.branches[0].name));
  for (const group of ordered) {
    const names = sortNames(group.branches.map((branch) => cleanBranchName(branch.name)));
    if (names.length > 1) {
      lines.push(rtl('📍 المواعيد المشتركة'), rtl(`🏥 ${names.map(bidi).join('، ')}`));
    } else lines.push(rtl(`🏥 ${bidi(names[0])}`));
    appendSchedule(lines, group.entries);
    lines.push('');
  }
  lines.push(rtl('🌸 يسعدنا استقبالكم في الأوقات المناسبة لكم'));
  return compactLines(lines).join('\n');
}

function appendSchedule(lines, entries) {
  for (const group of consecutiveScheduleGroups(entries)) {
    if (lines.at(-1) !== '') lines.push('');
    const dayText = formatDayRange(group.map((entry) => entry.dayOfWeek));
    const entry = group[0];
    if (entry.isClosed) lines.push(rtl(`🚫 ${dayText}: إجازة`));
    else lines.push(rtl(`📅 ${dayText}`), '', rtl(`⏰ من ${bidi(formatWorkingTime(entry.opensAt))} إلى ${bidi(formatWorkingTime(entry.closesAt))}`));
  }
}

function normalizeWorkingHoursEntry(entry) {
  const dayOfWeek = Number(entry?.dayOfWeek);
  if (!DAY_ORDER.includes(dayOfWeek)) return null;
  const isClosed = entry?.isClosed === true;
  const opensAt = isClosed ? null : normalizeDatabaseTime(entry?.opensAt);
  const closesAt = isClosed ? null : normalizeDatabaseTime(entry?.closesAt);
  if (!isClosed && (!opensAt || !closesAt)) return null;
  return { dayOfWeek, isClosed, opensAt, closesAt };
}

function normalizeDatabaseTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/u);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatWorkingTime(value) {
  const normalized = normalizeDatabaseTime(value);
  if (!normalized) return 'غير محدد';
  const [hourText, minute] = normalized.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}${minute === '00' ? '' : `:${minute}`} ${hour < 12 ? 'صباحًا' : 'مساءً'}`;
}

function consecutiveScheduleGroups(entries) {
  const groups = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (previous && sameSchedule(previous[0], entry) && areConsecutive(previous.at(-1).dayOfWeek, entry.dayOfWeek)) previous.push(entry);
    else groups.push([entry]);
  }
  return groups;
}

function sameSchedule(left, right) {
  return left.isClosed === right.isClosed && left.opensAt === right.opensAt && left.closesAt === right.closesAt;
}

function areConsecutive(leftDay, rightDay) {
  return DAY_ORDER.indexOf(rightDay) === DAY_ORDER.indexOf(leftDay) + 1;
}

function formatDayRange(days) {
  const names = days.map(displayDay);
  return names.length === 1 ? names[0] : `من ${names[0]} إلى ${names.at(-1)}`;
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
    footer: '🌸 يسعدنا التحقق من التغطية المناسبة لخدمتك',
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
  const lines = [rtl(`${icon} ${title}`), '', ...(values.length ? values.map(listItem) : [rtl('لا توجد عناصر نشطة متاحة حاليًا.')])];
  if (values.length) lines.push('', rtl(LIST_DIVIDER), '', rtl(selection ? question : footer));
  return lines.join('\n');
}

function formatBookingSummary(input = {}) {
  const lines = [rtl('📋 *راجعي تفاصيل حجزك*'), ''];
  lines.push(...appointmentFields(input, { includePayment: true }));
  if (isInsurancePayment(input.paymentMethod)) {
    pushLine(lines, '🏢', 'شركة التأمين', input.insuranceCompany?.name);
    pushLine(lines, '🎫', 'الفئة', input.insuranceClass?.name);
  }
  lines.push('', rtl('هل البيانات صحيحة؟ 🌸'));
  return compactLines(lines).join('\n');
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

  const lines = [rtl('✅ *تم تأكيد حجزك بنجاح*'), ''];
  pushLine(lines, '🔖', 'رقم الحجز', input.bookingReference);
  lines.push(...appointmentFields(input, { includePayment: true, includeAssigned: true }));
  const reference = cleanValue(input.bookingReference);
  if (!reference) pushLine(lines, '🔖', 'رقم الحجز', input.bookingReference);
  lines.push('', rtl('ننتظرك في الموعد 🌸'));
  return compactLines(lines).join('\n');
}

function formatAppointmentChangeReview({ operation, appointment = {}, target = {}, assignment = {}, price = {}, appointmentStart } = {}) {
  const isService = operation === 'change_service';
  const title = isService ? '🌸 *تأكيد تغيير الخدمة*' : '🌸 *تأكيد تغيير الفرع*';
  const lines = [rtl(title), ''];
  pushLine(lines, '🔖', 'رقم الحجز', appointment.booking_reference);
  if (isService) {
    pushLine(lines, '🩺', 'الخدمة الحالية', appointment.service_name);
    pushLine(lines, '✨', 'الخدمة الجديدة', target.name);
    pushLine(lines, '📍', 'الفرع', appointment.branch_name);
  } else {
    pushLine(lines, '📍', 'الفرع الحالي', appointment.branch_name);
    pushLine(lines, '✨', 'الفرع الجديد', target.name);
    pushLine(lines, '🩺', 'الخدمة', appointment.service_name);
  }
  const doctorChanged = (appointment.doctor_id || null) !== (assignment.doctor_id || null);
  const roomChanged = (appointment.room_id || null) !== (assignment.room_id || null);
  pushLine(lines, '👩‍⚕️', 'الطبيبة', doctorChanged ? assignment.doctor_name : appointment.doctor_name);
  pushLine(lines, '🚪', 'الغرفة', roomChanged ? (assignment.room_number || assignment.room_name) : (appointment.room_number || appointment.room_name));
  const schedule = formatAppointmentScheduleForCard(appointmentStart || appointment.appointment_start);
  pushLine(lines, '📅', 'التاريخ', schedule.dateText);
  pushLine(lines, '🕐', 'الوقت', schedule.timeText);
  if (appointment.quoted_price != null && String(appointment.quoted_price) !== String(price.price)) {
    pushLine(lines, '💳', 'السعر السابق', `${appointment.quoted_price} ${appointment.currency || 'SAR'}`);
    pushLine(lines, '💳', 'السعر الجديد', `${price.price} ${price.currency || appointment.currency || 'SAR'}`);
  }
  lines.push('', rtl(isService ? 'هل ترغبين في تأكيد تغيير الخدمة؟' : 'هل ترغبين في تأكيد تغيير الفرع؟'));
  return compactLines(lines).join('\n');
}

function formatAppointmentChangeSuccess({ operation, appointment = {} } = {}) {
  const title = operation === 'change_service' ? '✅ *تم تغيير خدمة الموعد بنجاح*' : '✅ *تم تغيير فرع الموعد بنجاح*';
  const lines = [rtl(title), ''];
  pushLine(lines, '🔖', 'رقم الحجز', appointment.booking_reference);
  pushLine(lines, '🩺', 'الخدمة', appointment.service_name);
  pushLine(lines, '📍', 'الفرع', appointment.branch_name);
  pushLine(lines, '👩‍⚕️', 'الطبيبة', appointment.doctor_name);
  pushLine(lines, '🚪', 'الغرفة', appointment.room_number || appointment.room_name);
  const schedule = formatAppointmentScheduleForCard(appointment.appointment_start);
  pushLine(lines, '📅', 'التاريخ', schedule.dateText);
  pushLine(lines, '🕐', 'الوقت', schedule.timeText);
  return compactLines(lines).join('\n');
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

function addReviewSection(sections, icon, title, value) {
  const clean = cleanValue(value);
  if (clean) sections.push([rtl(`${icon} *${title}*`), rtl(bidi(clean))]);
}

function appointmentFields(input, { includePayment = false, includeAssigned = false } = {}) {
  const lines = [];
  pushLine(lines, '🩺', 'الخدمة', input.service?.name);
  pushLine(lines, '📍', 'الفرع', branchWithCity(input.branch));
  if (input.service?.requiresDoctor === true || (includeAssigned && personName(input.doctor))) pushLine(lines, '👩‍⚕️', 'الطبيبة', personName(input.doctor));
  if (input.service?.requiresRoom === true || (includeAssigned && roomLabel(input.room))) pushLine(lines, '🚪', 'الغرفة', roomLabel(input.room));
  pushLine(lines, '📅', 'التاريخ', input.dateText);
  pushLine(lines, '🕐', 'الوقت', input.timeText);
  if (includePayment) pushLine(lines, '💳', 'طريقة الدفع', input.paymentMethod?.name);
  const amount = normalizedDecimal(input.quotedPrice);
  if (amount) pushLine(lines, '💳', 'السعر', `${amount} ${cleanValue(input.currency) || 'SAR'}`);
  return lines;
}

function pushLine(lines, icon, label, value) {
  const clean = cleanValue(value);
  if (clean) lines.push(rtl(`${icon} *${label}:* ${bidi(clean)}`));
}

function compactLines(lines) {
  return lines.filter((line, index) => line !== '' || (index > 0 && lines[index - 1] !== ''));
}

function formatAppointmentScheduleForCard(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { dateText: null, timeText: null };
  return {
    dateText: new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date),
    timeText: new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
  };
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

function plainClinicTitle(icon, title, clinicName) {
  const clinic = cleanValue(clinicName);
  return rtl(`${icon} ${title}${clinic ? ` في ${bidi(clinic)}` : ''}`);
}

function displayItems(items) {
  return activeItems(items).map((item) => cleanValue(typeof item === 'string' ? item : item?.name)).filter(Boolean);
}

function activeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.isActive !== false && item?.is_active !== false);
}

function listItem(value) { return rtl(`• ${bidi(value)}`); }
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

function displayDay(day) {
  return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][Number(day)] || 'يوم غير محدد';
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
  formatWorkingHours,
  formatUnknown,
  formatBookingClarification,
  formatInlineListItem,
  formatBookingSummary,
  formatBookingSuccess,
  formatAppointmentChangeReview,
  formatAppointmentChangeSuccess,
  formatNoActiveBranches,
  controls: Object.freeze({ RLM, LRI, PDI }),
};
