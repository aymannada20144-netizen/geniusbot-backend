'use strict';

const { normalizeArabic } = require('./ShadenArabicNormalizer');
const { resolveBookingIntent } = require('./ShadenIntentResolver');
const messageFormatter = require('./ShadenMessageFormatter');
const DAYS = Object.freeze([
  'الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء',
  'الخميس', 'الجمعه', 'السبت',
]);
const DISPLAY = Object.freeze({
  cash: 'كاش',
  insurance: 'تأمين',
  jeddah: 'جدة',
  riyadh: 'الرياض',
});
const SERVICE_ALIASES = Object.freeze({});
const NAME_PREFIX = /^(?:اسمي|اسمى|أنا|انا|معك|معاكِ|معاكي)\s+/u;

const SAUDI_CITIES = Object.freeze([
  'الرياض', 'riyadh', 'جدة', 'جده', 'jeddah', 'الدمام', 'dammam', 'الخبر', 'khobar', 'الظهران', 'dhahran',
  'مكة', 'مكة المكرمة', 'مكه', 'مكه المكرمه', 'makkah', 'mecca', 'المدينة', 'المدينة المنورة', 'المدينه', 'المدينه المنوره', 'madinah', 'medina',
  'الدرعية', 'الدرعيه', 'diriyah', 'الخرج', 'kharj', 'الدوادمي', 'dawadmi', 'المجمعة', 'المجمعه', 'majmaah',
  'القويعية', 'القويعيه', 'quwayiyah', 'الأفلاج', 'الافلاج', 'aflaj', 'وادي الدواسر', 'وادى الدواسر', 'wadi ad dawasir',
  'الزلفي', 'الزلفى', 'zulfi', 'شقراء', 'شقرا', 'shaqra', 'عفيف', 'afif', 'الغاط', 'ghat',
  'حوطة بني تميم', 'حوطه بني تميم', 'hawtat bani tamim', 'السليل', 'sulayyil', 'ضرما', 'ضرماء', 'dharma',
  'المزاحمية', 'المزاحميه', 'muzahimiyah', 'الحريق', 'hariq', 'مرات', 'marat',
  'الطائف', 'الطايف', 'taif', 'القنفذة', 'القنفذه', 'qunfudhah', 'الليث', 'leeth', 'رابغ', 'rabigh',
  'خليص', 'khulais', 'الخرمة', 'الخرمه', 'khurma', 'رنية', 'رنيه', 'ranyah', 'تربة', 'تربه', 'turabah',
  'الجموم', 'jamoom', 'بحرة', 'بحره', 'bahrah',
  'ينبع', 'yanbu', 'العلا', 'العُلا', 'alula', 'المهد', 'مهد الذهب', 'mahd al dhahab',
  'الحناكية', 'الحناكيه', 'hanakiyah', 'بدر', 'badr', 'خيبر', 'khaybar', 'العيص', 'ais',
  'وادي الفرع', 'وادى الفرع', 'wadi al fara',
  'بريدة', 'بريده', 'buraidah', 'عنيزة', 'عنيزه', 'unaizah', 'الرس', 'rass', 'المذنب', 'mithnab',
  'البكيرية', 'البكيريه', 'bukayriyah', 'البدائع', 'البدايع', 'badaya', 'الأسياح', 'الاسياح', 'asyach',
  'النبهانية', 'النبهانيه', 'nabhaniyah', 'الشماسية', 'الشماسيه', 'shamasiyah', 'عيون الجواء', 'oyon al jawa',
  'رياض الخبراء', 'riyad al khabra', 'عقلة الصقور', 'عقله الصقور', 'oqlat as suqur', 'ضرية', 'ضريه', 'dhariyah',
  'الأحساء', 'الاحساء', 'الهفوف', 'ahsa', 'hofuf', 'حفر الباطن', 'حفرالباطن', 'hafar al batin',
  'الجبيل', 'jubail', 'القطيف', 'qatif', 'الخفجي', 'khafji', 'رأس تنورة', 'راس تنورة', 'راس تنوره', 'ras tanura',
  'بقيق', 'buqayq', 'النعيرية', 'النعيريه', 'nairyah', 'قرية العليا', 'قربة العليا', 'qariya al olaya',
  'أبها', 'ابها', 'abha', 'خميس مشيط', 'khamis mushait', 'بيشة', 'بيشه', 'bisha', 'النماص', 'namas',
  'محايل عسير', 'محايل', 'muhayil', 'ظهران الجنوب', 'dhahran al janub', 'تثليث', 'tathleeth',
  'سراة عبيدة', 'سراة عبيده', 'سراه عبيده', 'sarat abida', 'رجال ألمع', 'رجال المع', 'rijal almaa',
  'بلقرن', 'balqarn', 'أحد رفيدة', 'احد رفيدة', 'احد رفيده', 'ahad rafidah', 'المجاردة', 'المجارده', 'majardah',
  'البرك', 'birk', 'بارق', 'bariq', 'تنومة', 'تنومه', 'tanomah', 'طريب', 'tareeb',
  'تبوك', 'tabuk', 'الوجه', 'wejh', 'ضباء', 'duba', 'تيماء', 'tayma', 'أملج', 'umluj', 'حقل', 'haql', 'البدع', 'bada',
  'حائل', 'حايل', 'hail', 'بقعاء', 'baqa', 'الغزالة', 'الغزاله', 'ghazalah', 'الشنان', 'shanan',
  'الحائط', 'hait', 'السليمي', 'sulaymi', 'الشملي', 'shamli', 'موقق', 'mawqaq', 'سميراء', 'samira',
  'عرعر', 'arar', 'رفحاء', 'rafha', 'طريف', 'turaif', 'العويقيلة', 'العويقيله', 'uwayqilah',
  'جازان', 'جيزان', 'jazan', 'صبيا', 'sabya', 'أبو عريش', 'abu arish', 'صامطة', 'صامطه', 'samtah',
  'بيش', 'bish', 'الدرب', 'darb', 'الحرث', 'harath', 'ضمد', 'dhamad', 'الريث', 'reeth', 'فرسان', 'farasan',
  'الدائر', 'dayer', 'العارضة', 'العارضه', 'ardah', 'أحد المسارحة', 'ahad al masarhah', 'العيدابي', 'aydabi',
  'فيفاء', 'فيفا', 'fifa', 'الطوال', 'tuwal', 'هروب', 'harub',
  'نجران', 'najran', 'شرورة', 'شروره', 'sharurah', 'حبونا', 'hubuna', 'بدر الجنوب', 'badr al janub',
  'يدمة', 'يدمه', 'yadamah', 'ثار', 'thar', 'خباش', 'khabash', 'الخرخير', 'kharkhir',
  'الباحة', 'الباحه', 'baha', 'بلجرشي', 'baljurashi', 'المندق', 'mandaq', 'المخواة', 'المخواه', 'makhwah',
  'قلوة', 'قلوه', 'qilwah', 'العقيق', 'aqiq', 'القرى', 'qora', 'الحجرة', 'الحجره', 'hajrah', 'بني حسن', 'bani hasan',
  'سكاكا', 'sakaka', 'القريات', 'gurayat', 'دومة الجندل', 'dumat al jandal', 'طبرجل', 'tubarjal'
]);

class ShadenPolicy {
  initialState() {
    return {
      version: 1,
      mode: 'idle',
      step: null,
      customer: { name: null },
      context: null,
      options: [],
    };
  }

  normalize(value) { return normalizeArabic(value); }

  recognize(message) {
    const text = this.normalize(message);
    const greeting = recognizeGreeting(text);
    if (greeting) return greeting;
    if (isPresence(text)) return { type: 'presence' };
    if (isIdentity(text)) return { type: 'identity' };
    const courtesy = recognizeCourtesy(text);
    if (courtesy) return courtesy;
    if (isFarewell(text)) return { type: 'farewell' };
    if (isAcknowledgement(text)) return { type: 'acknowledgement' };
    if (isHowAreYou(text)) return { type: 'how_are_you' };
   
    const bookingIntent = resolveBookingIntent(text);
    if (bookingIntent) return bookingIntent;
   
    const addressMatch = text.match(/(?:عنوان|العنوان|مكان|المكان|وين|اين).*(?:فرع|العياده|العيادة)|^(?:عنوان|العنوان)\s+(.+)/);
    if (addressMatch) {
      const branchNameMatch = text.match(/(?:فرع)\s+(.+?)(?:\s|$)/);
      return { type: 'branch_address', branchText: branchNameMatch?.[1] || null };
    }

    if (/شركات التامين/.test(text)) return { type: 'insurance_companies' };
    if (/(الفئات|فئات التامين|الفئات المعتمده)/.test(text)) return { type: 'insurance_classes' };
   
    let classMatch = text.match(/(?:class|كلاس|فئه|فئة)\s+([a-zA-Z])(?:\s|$)/);
    if (classMatch) return { type: 'insurance_class_check', value: classMatch[1].toUpperCase() };
    
    if (/(تامين|تقبلون|لديكم|يوجد|مقبول|ماذا عن|متوفر|موفرون)/.test(text)) {
        let letterMatch = text.match(/([a-zA-Z])(?:\s|$)/);
        if (letterMatch) return { type: 'insurance_class_check', value: letterMatch[1].toUpperCase() };
    }
    let standaloneLetterMatch = text.match(/(?:^|\s)([a-zA-Z])(?:\s|$)/);
    if (standaloneLetterMatch && text.length < 15) {
      return { type: 'insurance_class_check', value: standaloneLetterMatch[1].toUpperCase() };
    }

    // ✅ التعرف على الاستفسار عن اعتماد شركة تأمين محددة (يفصل النية عن البيانات)
    if (/(شركه|شركة|تامين|تأمين|معتمد|مقبول)/.test(text)) {
      const stopWords = ['هل', 'وش', 'اي', 'ا', 'شركه', 'شركة', 'تامين', 'تأمين', 'تاميني', 'هي', 'اسمها', 'معتمده', 'معتمد', 'مقبوله', 'مقبول', 'لديكم', 'لدينا', 'عندكم', 'تقبلون', 'تقبلين', 'تتابع', 'تتبع', 'تابع', 'تابعه', 'لكم', 'فهل', 'ام', 'او', 'مجهوله', 'مجهولة', 'و', 'انا', 'أنا', 'ال'];
      const words = text.split(' ');
      const companyName = words.filter(w => !stopWords.includes(w) && w.length > 1).join(' ').trim();
      
      if (companyName) {
        return { type: 'insurance_company_check', companyName };
      }
    }

    if (/(طريقه|طرق|وسيله|وسائل).*(دفع|سداد)|كيف (ادفع|اندفع|اسدد)|هل تقبلون (الكاش|الدفع|التامين)/.test(text)) {
      return { type: 'payment_methods' };
    }

    if (/(يوم الاجازه|يوم العطله|يوم عطله|يوم العطلة|الاجازه|العطله|الاجازة|العطلة|طوال الاسبوع|ايام الاسبوع|هل لديكم عطله)/.test(text)) {
      return { type: 'holiday_day' };
    }

    if (/(خساره|خسارة|مؤسف|يا ليت|حقيقي|للاسف|للأسف|تستاهلون|نتمنى|نفساني|مشاعر)/.test(text)) {
      return { type: 'empathy' };
    }

    const branchHoursMatch = text.match(/(?:مواعيد|ساعات|اوقات).*(?:فرع|في)\s+(.+?)(?:\s|$)/);
    if (branchHoursMatch && !text.includes('يوم') && !DAYS.some(d => text.includes(d))) {
      return { type: 'working_hours_branch', branchText: branchHoursMatch[1] };
    }

    const cityMatch = text.match(/(?:مواعيد|ساعات|اوقات).*(جده|جدة|الرياض|الدمام|الاحساء|مكة|مكه|تبوك|ابها)/);
    if (cityMatch && !DAYS.some(d => text.includes(d))) {
      return { type: 'working_hours_city', city: cityMatch[1] };
    }

    const day = DAYS.findIndex((name) => text.includes(name));
    if (day >= 0) {
      return { type: 'working_day', day, branchText: extractBranchText(text) };
    }

    if (/(مواعيد|ساعات|اوقات|دوام)/.test(text) || /مواعيدكم|دوامكم/.test(text)) {
      return { type: 'working_hours' };
    }

    const servicesUnderMatch = text.match(/(?:خدمات|خدمه|انواع|أنواع)\s+(.+)/);
    if (servicesUnderMatch && !servicesUnderMatch[1].includes('كم')) {
      return { type: 'services_under_specialty', specialtyText: servicesUnderMatch[1] };
    }

    if (/(ما|وش|اي|ا)?\s*(خدمات|الخدمات|خدماتكم)/.test(text)) return { type: 'services' };
    if (/(ما|وش|اي|ا)?\s*(تخصصات|التخصصات|تخصصاتكم)/.test(text)) return { type: 'specialties' };
   
    const norCityMatch = text.match(/^(?:ولا|و)\s*(.+)$/);
    if (norCityMatch) {
        const city = extractCity(norCityMatch[1]);
        if (city) return { type: 'branches', city };
    }
    const standaloneCity = extractCity(text);
    if (standaloneCity && text.length < 15) return { type: 'branches', city: standaloneCity };
   
    if (/(فروع|الفروع|فرع|كم فرع)/.test(text)) return { type: 'branches', city: extractCity(text) };

    const serviceMatch = text.match(/^(?:هل لديكم|هل عندكم|هل يوجد|هل يوجد لديكم|هل متوفر|هل موجود|هل توفرون|هل تقدمون)\s+(.+)$/);
    if (serviceMatch) return { type: 'service_exists', value: serviceMatch[1] };
    
    const norServiceMatch = text.match(/^(?:ولا|و)\s*(.+)$/);
    if (norServiceMatch) {
      if (/^[a-zA-Z]$/.test(norServiceMatch[1].trim())) return { type: 'insurance_class_check', value: norServiceMatch[1].trim().toUpperCase() };
      return { type: 'service_exists', value: norServiceMatch[1] };
    }

    const departmentMatch = text.match(/^(?:كشف|قسم|علاج|حجز|عملية|ليزر|تنظيف|تقشير|شد|حقن|فيلر|بوتوكس|استشاره|استشارة)\s+(.+)$/);
    if (departmentMatch) return { type: 'service_exists', value: departmentMatch[0] };

    return { type: 'unknown' };
  }

  extractCustomerName(message) {
    if (this.recognize(message).type !== 'unknown') return null;
    const candidate = String(message || '').trim().replace(NAME_PREFIX, '').replace(/\s+/g, ' ');
    if (!candidate || candidate.length > 40 || candidate.split(' ').length > 4) return null;
    if (!/^[\u0621-\u063A\u0641-\u065F\u066E-\u06D3\s]+$/u.test(candidate)) return null;
    if (/^(نعم|لا|شكرا|الخدمات|الفروع)$/.test(this.normalize(candidate))) return null;
    return candidate;
  }

  greeting(kind, customerName) {
    const opening = { morning: 'صباح النور', evening: 'مساء النور', salam: 'وعليكم السلام ورحمة الله وبركاته', casual: 'أهلًا وسهلًا' }[kind] || 'أهلًا وسهلًا';
    if (customerName) {
      if (kind === 'morning' || kind === 'evening') return `${opening} يا ${customerName} 🌸\nكيف أقدر أساعدكِ؟`;
      return [`${opening} 🌸`, `أهلًا بيكِ يا ${customerName}، نورتينا.`, 'كيف أقدر أساعدكِ؟'].join('\n');
    }
    return `${opening} 🌸\nممكن أعرف اسمكِ؟`;
  }
  combinedGreeting(customerName) { return customerName ? `أهلًا وسهلًا يا ${customerName} 🌸 الحمد لله بخير.\nكيف أقدر أساعدكِ؟` : 'أهلًا وسهلًا 🌸 الحمد لله بخير.\nممكن أعرف اسمكِ؟'; }
  nameCaptured(name) { return `أهلًا بيكِ يا ${name}، نورتينا 🌸\nكيف أقدر أساعدكِ؟`; }
  presence(customerName, assistantIdentity) { const identity = assistantIdentityText(assistantIdentity); return customerName ? `نعم معاكِ يا ${customerName} 🌸\nكيف أقدر أساعدكِ؟` : `نعم معاكِ ${identity.name} 🌸\nكيف أقدر أساعدكِ؟`; }
  identity(clinicName, customerName, assistantIdentity) { const identity = assistantIdentityText(assistantIdentity); return customerName ? `معك ${identity.name} يا ${customerName}، ${identity.role} في ${clinicName} 🌸` : `معك ${identity.name}، ${identity.role} في ${clinicName} 🌸\nممكن أعرف اسمكِ؟`; }
  howAreYou(customerName) { return `الحمد لله بخير${customerName ? ` يا ${customerName}` : ''}، شكرًا لسؤالكِ 🌸\nكيف أقدر أساعدكِ؟`; }
  courtesy(kind, customerName) { const name = customerName ? ` يا ${customerName}` : ''; return { wellbeing: `الله يعافيكِ${name}، تحت أمركِ ✨`, affection: `حبيبتي${name}، هذا واجبي 🌸`, praise: `تسلمي${name}، نورتينا 🌸` }[kind] || `العفو${name}، تحت أمركِ دائمًا 🌸`; }
  acknowledgement(customerName) { return customerName ? `تمام يا ${customerName} 🌸` : 'تمام 🌸'; }
  farewell(customerName) { return customerName ? `مع السلامة يا ${customerName}، نورتينا 🌸` : 'مع السلامة، سعدت بخدمتكِ 🌸'; }

  cleanBranchName(name) { let c = String(name || '').replace(/Oryan Clinic\s*-\s*/i, '').replace(/\s*\(\d+\)\s*$/, ''); return this.display(c); }
  branchLabel(branch) {
    if (!branch) return 'الفرع';
    const city = this.display(branch.city);
    const name = this.cleanBranchName(branch.name);
    return city && name ? `${city} — ${name}` : city || name || 'الفرع';
  }

  branches(items) { return messageFormatter.formatBranches({ items: items.map(b => ({ ...b, name: this.cleanBranchName(b.name), city: this.display(b.city) })) }); }
  branchExists(branch) { return !branch ? 'لا يوجد لدينا فرع نشط مطابق حاليًا. 🌸' : `نعم، لدينا ${this.branchLabel(branch)}.`; }
  specialties(items, clinic) { return messageFormatter.formatSpecialties({ items: items.map(item => ({ ...item, name: this.display(item.name) })), clinicName: clinic?.name }); }
  services(items, clinic, selection = false) { return messageFormatter.formatServices({ items: items.map(item => ({ ...item, name: this.display(item.name) })), clinicName: clinic?.name, selection }); }
  serviceExists(service) { return service ? `نعم، خدمة ${this.display(service.name)} متوفرة لدينا.` : 'عذراً، لا نقدم هذه الخدمة لأنها غير مسجلة لدينا حالياً. 🌸'; }
  
  paymentMethods(items, selection = false) { return messageFormatter.formatPaymentMethods({ items: items.map(item => ({ ...item, name: this.display(item.name) })), selection }); }
  insuranceCompanies(items, selection = false) { return messageFormatter.formatInsuranceCompanies({ items: items.map(item => ({ ...item, name: this.display(item.name) })), selection }); }
  
  insuranceClasses(items, selection = false) { return messageFormatter.formatInsuranceClasses({ items: items.map(item => ({ ...item, name: this.display(item.name) })), selection }); }
  
  insuranceClassStatus(item, requested) { return !item ? `عذراً، فئة ${requested} غير مقبولة حالياً. 🌸` : (item.isAccepted ? `نعم، فئة ${this.display(item.name)} مقبولة. 🌸` : `عذراً، فئة ${this.display(item.name)} غير مقبولة حالياً. 🌸`); }

  allWorkingHours(snapshot, cityFilter = null) {
    if (!snapshot.workingHours.length) return 'مواعيد العمل غير مسجلة حاليًا. 🌸';
    const branches = new Map(snapshot.branches.map(b => [b.id, b]));
    const branchSchedules = new Map();
    
    for (const hours of snapshot.workingHours) {
      const branch = branches.get(hours.branchId);
      if (!branch) continue;
      const branchName = this.branchLabel(branch);
      if (cityFilter) {
        if (this.normalize(branch.city) !== this.normalize(cityFilter)) continue;
      }
      if (!branchSchedules.has(branchName)) branchSchedules.set(branchName, []);
      branchSchedules.get(branchName).push(hours);
    }

    if (branchSchedules.size === 0) return `لا يوجد لدينا فروع في ${this.display(cityFilter)} حاليًا. 🌸`;

    const groupedBySchedule = new Map();
    for (const [bName, hList] of branchSchedules.entries()) {
      hList.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
      const scheduleKey = hList.map(h => `${h.dayOfWeek}:${h.isClosed}:${h.opensAt}:${h.closesAt}`).join('|');
      if (!groupedBySchedule.has(scheduleKey)) groupedBySchedule.set(scheduleKey, { branchNames: [], hours: hList });
      groupedBySchedule.get(scheduleKey).branchNames.push(bName);
    }

    const lines = [cityFilter ? `مواعيد العمل لفروع ${this.display(cityFilter)} كالتالي:` : 'مواعيد العمل لدينا كالتالي:'];
    const isSingleSchedule = groupedBySchedule.size === 1;

    for (const group of groupedBySchedule.values()) {
      if (isSingleSchedule) lines.push(``, `📍 جميع الفروع:`);
      else lines.push(``, `📍 ${group.branchNames.join('، ')}`);
      
      const open = group.hours.filter(h => !h.isClosed);
      const closed = group.hours.filter(h => h.isClosed);
      
      if (open.length > 0) {
        const first = open[0];
        const same = open.every(h => h.opensAt === first.opensAt && h.closesAt === first.closesAt);
        if (same) {
          const cDay = closed.length > 0 ? displayDay(closed[0].dayOfWeek) : null;
          if (open.length === 6 && cDay) lines.push(`🕒 يومياً عدا ${cDay}: من ${time(first.opensAt)} إلى ${time(first.closesAt)}`);
          else if (open.length === 7) lines.push(`🕒 طوال الأسبوع: من ${time(first.opensAt)} إلى ${time(first.closesAt)}`);
          else group.hours.forEach(h => lines.push(this.formatHoursForList(h)));
        } else group.hours.forEach(h => lines.push(this.formatHoursForList(h)));
      } else lines.push(`🕒 مغلق طوال الأسبوع.`);
    }
    lines.push(``, ``);
    return lines.join('\n');
  }

  branchWorkingHours(branch, snapshot) {
    if (!branch) return 'الفرع المذكور غير مسجل لدينا. 🌸';
    const h = snapshot.workingHours.filter(h => h.branchId === branch.id);
    if (!h.length) return `لا توجد مواعيد عمل مسجلة لـ${this.branchLabel(branch)}.`;
    const lines = [`مواعيد عمل ${this.branchLabel(branch)}:`];
    h.forEach(x => lines.push(this.formatHoursForList(x)));
    lines.push(``, ``);
    return lines.join('\n');
  }
  
  formatHoursForList(hours) { return messageFormatter.formatInlineListItem(`${displayDay(hours.dayOfWeek)}: ${hours.isClosed ? 'مغلق' : `من ${time(hours.opensAt)} إلى ${time(hours.closesAt)}`}`); }
  workingDay({ branch, hours, day }) { const bN = branch ? this.branchLabel(branch) : 'الفرع'; return !branch ? 'الفرع المذكور غير مسجل لدينا. 🌸' : (!hours ? `لا توجد مواعيد عمل مسجلة لـ${bN} يوم ${day}.` : (hours.isClosed ? `${bN} مغلق يوم ${day}.` : `${bN} يعمل يوم ${day} من ${time(hours.opensAt)} إلى ${time(hours.closesAt)}.`)); }
  bookingCustomerName() { return 'يسعدني مساعدتك في حجز موعد 🌸\nممكن أعرف اسمكِ؟'; }
  bookingNameCaptured(name, services, clinic) { return `${this.nameCaptured(name)}\n\n${this.bookingChooseService(services, clinic)}`; }
  bookingChooseService(services, clinic) { return this.services(services, clinic, true); }
  bookingChooseCity(cities) { return messageFormatter.formatCities({ items: cities.map(city => this.display(city)), selection: true }); }
  bookingChooseBranch(branches) { return messageFormatter.formatBranches({ items: branches.map(b => ({ ...b, name: this.cleanBranchName(b.name), city: this.display(b.city) })), city: branches[0]?.city, selection: true }); }
  bookingAskAvailability() { return 'ما التاريخ والوقت المناسبان لكِ؟ 🌸'; }
  bookingAskTime() { return messageFormatter.formatBookingClarification({ kind: 'time' }); }
  bookingAskDate() { return messageFormatter.formatBookingClarification({ kind: 'date' }); }
  bookingClarifyTimePeriod() { return messageFormatter.formatBookingClarification({ kind: 'ambiguous_time' }); }
  bookingAvailabilityCheckFailed() { return 'تعذر التحقق من الموعد حاليًا. لم ننتقل إلى الدفع ولم يتم إنشاء حجز. حاولي إدخال التاريخ والوقت مرة أخرى. 🌸'; }
  bookingAvailabilityRejected({ reason, branch }) {
    const branchName = branch ? this.branchLabel(branch) : 'الفرع';
    if (reason === 'branch_closed') return `${branchName} مغلق في هذا اليوم. اختاري يومًا آخر لإكمال نفس الحجز. 🌸`;
    if (reason === 'clinic_holiday') return 'العيادة مغلقة في هذا التاريخ بسبب إجازة مسجلة. اختاري تاريخًا آخر لإكمال نفس الحجز. 🌸';
    if (['outside_branch_working_hours', 'outside_clinic_holiday_hours'].includes(reason)) return `هذا الوقت خارج مواعيد عمل ${branchName}. اختاري وقتًا آخر لإكمال نفس الحجز. 🌸`;
    if (['doctor_not_working', 'outside_doctor_working_hours', 'doctor_time_off'].includes(reason)) return 'الطبيب غير متاح في هذا الوقت. اختاري تاريخًا أو وقتًا آخر لإكمال نفس الحجز. 🌸';
    if (['room_inactive', 'room_branch_mismatch', 'room_time_off'].includes(reason)) return 'الغرفة المطلوبة غير متاحة في هذا الوقت. اختاري تاريخًا أو وقتًا آخر لإكمال نفس الحجز. 🌸';
    if (['service_assignment_not_found', 'doctor_service_assignment_not_found'].includes(reason)) return 'لا يوجد تعيين خدمة نشط وصالح لهذا الفرع حاليًا. اختاري فرعًا آخر لإكمال نفس الحجز. 🌸';
    if (['doctor_conflict', 'room_conflict', 'no_available_assignment', 'slot_not_available'].includes(reason)) return 'الموعد غير متاح في هذا الوقت. اختاري تاريخًا أو وقتًا آخر لإكمال نفس الحجز. 🌸';
    return 'تعذر التحقق من الموعد حاليًا. لم يتم إنشاء الحجز. حاولي مرة أخرى لإكمال نفس الحجز. 🌸';
  }
  bookingChoosePaymentMethod(methods) { return this.paymentMethods(methods, true); }
  bookingChooseInsuranceCompany(companies) { return messageFormatter.formatInsuranceCompanies({ items: companies.map(item => ({ ...item, name: this.display(item.name) })), selection: true }); }
  bookingChooseInsuranceClass(classes) { return messageFormatter.formatInsuranceClasses({ items: classes.map(item => ({ ...item, name: this.display(item.name) })), selection: true }); }
  bookingInsuranceDataIncomplete() { return 'تعذر تجهيز ملخص التأمين لأن بيانات الشركة أو الفئة غير مكتملة. اختاري بيانات التأمين مرة أخرى لإكمال نفس الحجز. 🌸'; }
  bookingInsuranceClassRejected() { return 'عذراً، فئة التأمين هذه غير مقبولة حالياً. 🌸\nيمكنكِ اختيار فئة مقبولة أو كتابة "كاش" لإكمال نفس الحجز بالدفع النقدي.'; }
  bookingConfirmationSummary({ service, branch, doctor, room, preferredStart, paymentMethod, insuranceCompany, insuranceClass }) {
    const schedule = formatAppointmentSchedule(preferredStart);
    return messageFormatter.formatBookingSummary({
      service: service ? { ...service, name: this.display(service.name) } : null,
      branch: branch ? { ...branch, name: this.cleanBranchName(branch.name), city: this.display(branch.city) } : null,
      doctor,
      room,
      dateText: schedule.dateText,
      timeText: schedule.timeText,
      paymentMethod: paymentMethod ? { ...paymentMethod, name: this.display(paymentMethod.name) } : null,
      insuranceCompany: insuranceCompany ? { ...insuranceCompany, name: this.display(insuranceCompany.name) } : null,
      insuranceClass: insuranceClass ? { ...insuranceClass, name: this.display(insuranceClass.name) } : null,
    });
  }
  bookingAskConfirmation() { return 'هل تؤكدين بيانات الحجز؟ يرجى الرد بنعم أو إلغاء. 🌸'; }
  bookingConfirmed() { return 'تم تأكيد بيانات الحجز 🌸\nجاري تسجيل الموعد.'; }
  bookingCancelled() { return 'تم إلغاء طلب الحجز 🌸'; }
  bookingCreated({ service, branch, doctor, room, paymentMethod, insuranceCompany, insuranceClass, preferredStart, appointment, customerName, bookingReference: authoritativeReference, quotedPrice, currency }) {
    const schedule = formatAppointmentSchedule(preferredStart);
    return messageFormatter.formatBookingSuccess({
      service: service ? { ...service, name: this.display(service.name) } : null,
      branch: branch ? { ...branch, name: this.cleanBranchName(branch.name), city: this.display(branch.city) } : null,
      doctor,
      room,
      dateText: schedule.dateText,
      timeText: schedule.timeText,
      paymentMethod: paymentMethod ? { ...paymentMethod, name: this.display(paymentMethod.name) } : null,
      insuranceCompany: insuranceCompany ? { ...insuranceCompany, name: this.display(insuranceCompany.name) } : null,
      insuranceClass: insuranceClass ? { ...insuranceClass, name: this.display(insuranceClass.name) } : null,
      customerName: this.display(customerName),
      bookingReference: bookingReference(
        authoritativeReference || appointment?.booking_reference
      ),
      quotedPrice,
      currency,
      appointmentStatus: appointment?.status || null,
    });
  }
  bookingUnavailableTime() { return 'عذراً، الموعد المطلوب غير متاح. 🌸\nاختاري تاريخاً ووقتاً آخرين لإكمال نفس الحجز.'; }
  bookingPersistenceFailed() { return 'تعذر تسجيل الموعد حالياً. لم يتم إنشاء الحجز. 🌸\nيمكنكِ المحاولة مرة أخرى بإرسال "نعم".'; }
  bookingUnavailable() { return 'لحجز موعد، يرجى كتابة "حجز" أو "ابغى احجز". 🌸'; }
  noActiveBranches(city) { return messageFormatter.formatNoActiveBranches(this.display(city)); }
  branchAddress(branch) { return !branch ? 'الفرع المذكور غير مسجل لدينا. 🌸' : `📍 عنوان ${this.branchLabel(branch)}:\n${branch.address ? this.display(branch.address) : 'غير مسجل حاليًا.'}`; }
  holidayDay(data) { if (!data.workingHours.length) return 'مواعيد العمل غير مسجلة لدينا. 🌸'; const c = new Set(), o = new Set(); for (const h of data.workingHours) { if (h.isClosed) c.add(h.dayOfWeek); else o.add(h.dayOfWeek); } const f = [...c].filter(d => !o.has(d)); return f.length > 0 ? `يوم الإجازة لدينا هو: ${f.map(d => displayDay(d)).join('، ')} 🌸` : `لا يوجد لدينا يوم إجازة أسبوعي لجميع الفروع، تختلف الإجازات حسب الفرع. يمكنك سؤالي عن مواعيد يوم محدد. 🌸`; }
  empathy() { const r = ["أقدر شعورك 🌸 ونسعى دائمًا للتوسع لنكون أقرب إليك. هل أقدر أساعدك بأي استفسار آخر؟", "شكرًا لتعاطفك 🌸 رأيك يهمنا ونسعى لتقديم الأفضل دائمًا. كيف أقدر أساعدك الآن؟", "حياك الله 🌸 نتمنى أن نراك في أحد فروعنا قريبًا. هل من شيء آخر أقدر أساعدك فيه؟"]; return r[Math.floor(Math.random() * r.length)]; }
  unknown() { return messageFormatter.formatUnknown(); }
  display(value) { let r = String(value || '').replace(/مكه/g, 'مكة'); for (const [e, a] of Object.entries(DISPLAY)) r = r.replace(new RegExp(`\\b${e}\\b`, 'gi'), a); return r; }
  serviceAliases() { return SERVICE_ALIASES; }
}

function recognizeGreeting(text) { const how = isHowAreYou(text); if (/^(?:هاي|هلا|اهلا|مرحبا)(?: والله)?(?: كيفك)?$/.test(text)) return { type: how ? 'combined_greeting' : 'greeting', kind: 'casual' }; if (/^(?:السلام عليكم|السلام)$/.test(text)) return { type: 'greeting', kind: 'salam' }; if (/^(?:صباح الخير|صباح النور|يسعد صباحك)$/.test(text)) return { type: 'greeting', kind: 'morning' }; if (/^(?:مساء الخير|مساء النور|يسعد مساك)$/.test(text)) return { type: 'greeting', kind: 'evening' }; return null; }
function isIdentity(text) { return /^(?:من معي|من معاي|مين معي|مين معاي|ما اسمك|اسمك ايه|من انتي|من انت|مين انت|ما اسم العياده|اسم العياده)$/.test(text); }
function assistantIdentityText(value) {
  const gender = value?.gender === 'male' ? 'male' : 'female';
  return {
    name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : 'شادن',
    role: gender === 'male' ? 'موظف الاستقبال الذكي' : 'موظفة الاستقبال الذكية',
  };
}
function isPresence(text) { return /^(?:هل )?(?:انتي معي|انتي موجوده)$/.test(text) || /^(?:موجوده|في احد|الو)$/.test(text); }
function isHowAreYou(text) { return /(?:كيفك|كيف حالك|كيف الحال|اخبارك|كيف امورك|طمنيني عنك|ان شاء الله بخير)/.test(text); }
function recognizeCourtesy(text) { if (/^(?:الله )?يعطيك العافيه$/.test(text)) return { type: 'courtesy', kind: 'wellbeing' }; if (/حبيبتي/.test(text)) return { type: 'courtesy', kind: 'affection' }; if (/^(?:تسلمي|ما قصرتي)(?: حبيبتي)?$/.test(text)) return { type: 'courtesy', kind: 'praise' }; if (/^(?:شكرا|متشكره)$/.test(text)) return { type: 'courtesy', kind: 'thanks' }; return null; }
function isAcknowledgement(text) { return /^(?:تمام|اوكي|حسنا|طيب|ماشي|جميل|ممتاز)$/.test(text); }
function isFarewell(text) { return /^(?:مع السلامه|الي اللقاء|اشوفك علي خير|نشوفك علي خير|في امان الله|تصبحي(?:n)? علي خير)$/.test(text); }
function extractCity(text) { for (const c of SAUDI_CITIES) if (text.includes(c)) return c; return null; }
function extractBranchText(text) { const m = text.match(/فرع\s+(.+?)\s+(?:يوم|يعمل)/); return m?.[1] || null; }
function displayDay(day) { return ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][day] || 'اليوم المحدد'; }
function time(value) { return value ? String(value).slice(0, 5) : 'غير محدد'; }


function formatAppointmentSchedule(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      dateText: 'غير محدد',
      timeText: 'غير محدد',
    };
  }

  return {
    dateText: new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      timeZone: 'Asia/Riyadh',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date),
    timeText: new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      timeZone: 'Asia/Riyadh',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date),
  };
}

function bookingReference(value) {
  const normalized = String(value || '').trim();
  return normalized && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}

function formatRoom(room) {
  if (!room || typeof room !== 'object') return null;
  const number = typeof room.number === 'string' || typeof room.number === 'number'
    ? String(room.number).trim()
    : '';
  const name = typeof room.name === 'string' ? room.name.trim() : '';
  if (!number) return null;
  return name ? `${number} — ${name}` : number;
}

module.exports = ShadenPolicy;
