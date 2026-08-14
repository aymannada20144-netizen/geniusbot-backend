'use strict';

const {
  normalizeArabic,
} = require('./ShadenArabicNormalizer');

class ShadenConversationalSignalDetector {
  detect(input = {}) {
    const rawText = typeof input === 'string'
      ? input
      : input?.text;

    const text = normalizeArabic(rawText);

    if (!text) {
      return safeSignals();
    }

    const correction = matchesAny(text, CORRECTION_PATTERNS);
    const interruption = matchesAny(text, INTERRUPTION_PATTERNS);

    const hesitation = matchesAny(text, HESITATION_PATTERNS);
    const objection = matchesAny(text, OBJECTION_PATTERNS);

    const complaint = matchesAny(text, COMPLAINT_PATTERNS);
    const anger = matchesAny(text, ANGER_PATTERNS);
    const frustration = matchesAny(text, FRUSTRATION_PATTERNS);
    const worried = matchesAny(text, WORRIED_PATTERNS);

    const medicalQuestion =
      matchesAny(text, MEDICAL_QUESTION_PATTERNS);

    const medicalRisk =
      matchesAny(text, MEDICAL_RED_FLAG_PATTERNS);

    const humanHandover =
      matchesAny(text, HUMAN_HANDOVER_PATTERNS);

    const abuseOrThreat =
      matchesAny(text, ABUSE_OR_THREAT_PATTERNS);

    const legalEscalation =
      matchesAny(text, LEGAL_ESCALATION_PATTERNS);

    const botFrustration =
      matchesAny(text, BOT_FRUSTRATION_PATTERNS);

    const sentiment = detectSentiment({
      text,
      anger,
      frustration,
      complaint,
      worried,
      hesitation,
      objection,
    });

    return Object.freeze({
      // State-dependent signals remain false here.
      confirmation: false,
      rejection: false,
      conditional: false,

      correction,
      interruption,
      hesitation,
      objection,
      complaint,

      medicalQuestion,
      medicalRisk,

      humanHandover,

      abuseOrThreat,
      legalEscalation,
      botFrustration,

      sentiment,
    });
  }
}

/**
 * Correction / self-repair
 * Examples:
 * "لا قصدي..."
 * "مو كذا..."
 * "غلط، أقصد..."
 */
const CORRECTION_PATTERNS = Object.freeze([
  /(?:^|\s)لا\s+قصدي(?:\s|$)/u,
  /(?:^|\s)قصدي(?:\s|$)/u,
  /(?:^|\s)اقصد(?:\s|$)/u,
  /(?:^|\s)لا\s+اقصد(?:\s|$)/u,
  /(?:^|\s)مو\s+كذا(?:\s|$)/u,
  /(?:^|\s)مش\s+كذا(?:\s|$)/u,
  /(?:^|\s)مو\s+هذا(?:\s|$)/u,
  /(?:^|\s)غلط(?:\s|$)/u,
  /(?:^|\s)خطا(?:\s|$)/u,
  /(?:^|\s)اصحح(?:\s|$)/u,
  /(?:^|\s)تصحيح(?:\s|$)/u,
]);

/**
 * Interruption / pause / step-back language.
 *
 * We detect the signal only.
 * What it means operationally belongs to the dialogue state.
 */
const INTERRUPTION_PATTERNS = Object.freeze([
  /(?:^|\s)لحظه(?:\s|$)/u,
  /(?:^|\s)لحظة(?:\s|$)/u,
  /(?:^|\s)ثانيه(?:\s|$)/u,
  /(?:^|\s)ثانية(?:\s|$)/u,
  /(?:^|\s)ثواني(?:\s|$)/u,
  /(?:^|\s)استني(?:\s|$)/u,
  /(?:^|\s)استنى(?:\s|$)/u,
  /(?:^|\s)انتظري(?:\s|$)/u,
  /(?:^|\s)انتظر(?:\s|$)/u,
  /(?:^|\s)مهلك(?:\s|$)/u,
  /(?:^|\s)رجعي(?:\s|$)/u,
  /(?:^|\s)ارجعي(?:\s|$)/u,
  /(?:^|\s)ارجع\s+خطوه(?:\s|$)/u,
  /(?:^|\s)ارجع\s+خطوة(?:\s|$)/u,
  /(?:^|\s)بس\s+عندي\s+سؤال(?:\s|$)/u,
  /(?:^|\s)طيب\s+قبل(?:\s|$)/u,
]);

/**
 * Hesitation / indecision.
 *
 * Reference examples include:
 * "بفكر", "بشاور زوجي", "محتارة".
 */
const HESITATION_PATTERNS = Object.freeze([
  /(?:^|\s)متردد(?:ه|ة)?(?:\s|$)/u,
  /(?:^|\s)محتار(?:ه|ة)?(?:\s|$)/u,
  /(?:^|\s)مو\s+متاكد(?:ه|ة)?(?:\s|$)/u,
  /(?:^|\s)مش\s+متاكد(?:ه|ة)?(?:\s|$)/u,
  /(?:^|\s)ماني\s+متاكد(?:ه|ة)?(?:\s|$)/u,
  /(?:^|\s)مدري(?:\s|$)/u,
  /(?:^|\s)ما\s+ادري(?:\s|$)/u,
  /(?:^|\s)بفكر(?:\s|$)/u,
  /(?:^|\s)افكر(?:\s|$)/u,
  /(?:^|\s)خليني\s+افكر(?:\s|$)/u,
  /(?:^|\s)بشاور(?:\s|$)/u,
  /(?:^|\s)بشاور\s+زوجي(?:\s|$)/u,
  /(?:^|\s)يمكن(?:\s|$)/u,
]);

/**
 * Objections.
 *
 * From the reference families:
 * price, distance, fear/pain, lack of time.
 */
const OBJECTION_PATTERNS = Object.freeze([
  // Price / value
  /(?:^|\s)غالي(?:\s|$)/u,
  /(?:^|\s)غاليه(?:\s|$)/u,
  /(?:^|\s)غالية(?:\s|$)/u,
  /السعر\s+(?:غالي|عالي|مبالغ\s+فيه)/u,
  /مبالغ\s+فيه/u,
  /ما\s+يستاهل/u,

  // Distance
  /بعيد\s+علي/u,
  /الفرع\s+بعيد/u,
  /بعيد\s+عني/u,

  // Fear / pain
  /خايف(?:ه|ة)?\s+من/u,
  /اخاف\s+من/u,
  /مؤلم/u,
  /يوجع/u,

  // Time
  /ما\s+عندي\s+وقت/u,
  /مو\s+فاضي(?:ه|ة)?/u,
  /مش\s+فاضي(?:ه|ة)?/u,
  /وقتي\s+ما\s+يسمح/u,

  // General rejection of value/fit
  /ما\s+يناسبني/u,
  /مو\s+مناسب\s+لي/u,
  /مش\s+مناسب\s+لي/u,
  /مو\s+مقتنع(?:ه|ة)?/u,
  /مش\s+مقتنع(?:ه|ة)?/u,
]);

/**
 * Complaint.
 *
 * Reference examples:
 * service poor, rude staff, long wait, bad result,
 * cleanliness/smell, price/value complaint.
 */
const COMPLAINT_PATTERNS = Object.freeze([
  /الخدمه\s+سيئه/u,
  /الخدمة\s+سيئة/u,
  /الموظف(?:ه|ة)?\s+كانت\s+فظ(?:ه|ة)/u,
  /انتظرت\s+(?:ساعه|ساعة|كثير)/u,
  /الموعد\s+تاخر/u,
  /تاخرتوا/u,
  /النتيجه\s+ما\s+عجبتني/u,
  /النتيجة\s+ما\s+عجبتني/u,
  /ما\s+شفت\s+فرق/u,
  /المكان\s+مو\s+نظيف/u,
  /المكان\s+مش\s+نظيف/u,
  /الروائح\s+مزعج(?:ه|ة)/u,
  /مو\s+عاجبني/u,
  /مش\s+عاجبني/u,
  /ما\s+احد\s+رد/u,
  /ما\s+حد\s+رد/u,
  /ابي\s+اشتكي/u,
  /ابغى\s+اشتكي/u,
  /اريد\s+اشتكي/u,
  /شكوى/u,
]);

/**
 * Strong anger.
 *
 * Kept separate from ordinary complaint.
 */
const ANGER_PATTERNS = Object.freeze([
  /انتم\s+نصابين/u,
  /ما\s+عندكم\s+ذمه/u,
  /ما\s+عندكم\s+ذمة/u,
  /اسوا\s+مكان/u,
  /أسوأ\s+مكان/u,
  /ما\s+راح\s+ارجع\s+لكم\s+ابدا/u,
  /معصب(?:ه|ة)?/u,
  /غاضب(?:ه|ة)?/u,
  /مستفز/u,
  /قهر/u,
]);

const FRUSTRATION_PATTERNS = Object.freeze([
  /منزعج(?:ه|ة)?/u,
  /زعلان(?:ه|ة)?/u,
  /طفشت/u,
  /تعبت\s+من/u,
  /ما\s+تفهمين/u,
  /بطيئ(?:ه|ة)?/u,
  /غبي(?:ه|ة)?/u,
]);

const WORRIED_PATTERNS = Object.freeze([
  /خايف(?:ه|ة)?/u,
  /اخاف/u,
  /قلقان(?:ه|ة)?/u,
  /متوتر(?:ه|ة)?/u,
  /خوف/u,
  /قلق/u,
]);

/**
 * Medical questions.
 *
 * This signal means "medical content needs knowledge/safety routing".
 * It does NOT mean Shaden may diagnose.
 */
const MEDICAL_QUESTION_PATTERNS = Object.freeze([
  /(?:هل|وش|ايش|كيف|ليش).*(?:يوجع|الم|ألم|احمرار|تورم|نزيف|حساسيه|حساسية|اعراض|أعراض|مضاعفات|اثار\s+جانبيه|آثار\s+جانبية|التعافي|النتيجه|النتيجة)/u,

  /(?:هل|ممكن|اقدر).*(?:اسوي|اسوى|اعمل).*(?:ليزر|فيلر|بوتكس|تقشير|تنظيف)/u,

  /(?:كيف|وش).*(?:اتحضر|استعد|اسوي\s+قبل).*(?:ل?(?:جلسه|جلسة)\s+|ل?)(?:ال)?(?:ليزر|فيلر|بوتوكس|بوتكس|تقشير|تنظيف)/u,

  /(?:حامل|مرضع|سكري|ضغط|حساسيه|حساسية).*(?:ليزر|فيلر|بوتكس|تقشير|جلسه|جلسة)/u,

  /(?:بعد\s+الجلسه|بعد\s+الجلسة|بعد\s+الليزر|بعد\s+الفيلر).*(?:طبيعي|وش|ايش|هل)/u,
]);

/**
 * Medical red flags from the reference.
 *
 * IMPORTANT:
 * Detection here is observation only.
 * Emergency/escalation behavior belongs to the safety/action layer.
 */
const MEDICAL_RED_FLAG_PATTERNS = Object.freeze([
  /حروق?\s+ليزر/u,
  /حرق\s+شديد/u,
  /حروق\s+شديده/u,
  /حروق\s+شديدة/u,

  /انتفاخ\s+شديد/u,
  /فقاقيع/u,
  /احمرار\s+حاد/u,

  /تورم\s+الوجه/u,
  /تورم\s+شديد/u,

  /نزيف/u,

  /الم\s+غير\s+محتمل/u,
  /ألم\s+غير\s+محتمل/u,
  /الم\s+شديد/u,
  /ألم\s+شديد/u,

  /التهاب/u,
  /صديد/u,

  /تغير\s+لون\s+الجلد\s+للاسود/u,
 /فقدان\s+احساس/u,
/فقدان\s+الاحساس/u,
/فقدت\s+الاحساس/u,
/فقدت\s+احساس/u,

  /اغماء/u,
  /إغماء/u,

  /ضيق\s+تنفس/u,

  /دوخه\s+شديده/u,
  /دوخة\s+شديدة/u,

  /هبوط\s+حاد/u,

  /حساسيه\s+شديده/u,
  /حساسية\s+شديدة/u,
]);

/**
 * Explicit human handover.
 *
 * Reference examples include:
 * "أبي إنسان", "حوليني موظفة", "أبي أكلم وحدة".
 */
const HUMAN_HANDOVER_PATTERNS = Object.freeze([
  /ابي\s+انسان/u,
  /ابغي\s+انسان/u,
  /اريد\s+انسان/u,

  /ابي\s+موظف(?:ه)?/u,
  /ابغي\s+موظف(?:ه)?/u,
  /اريد\s+موظف(?:ه)?/u,

  /حوليني\s+موظف(?:ه)?/u,
  /حولني\s+لموظف/u,

  /ابي\s+اكلم\s+(?:احد|وحده|موظف|موظفه)/u,
  /ابغي\s+اكلم\s+(?:احد|وحده|موظف|موظفه)/u,

  /خدمه\s+العملاء/u,
  /موظف(?:ه)?\s+استقبال/u,
]);

/**
 * Legal / official escalation language.
 */
const LEGAL_ESCALATION_PATTERNS = Object.freeze([
  /شكوي\s+رسميه/u,
  /محامي/u,
  /تقرير\s+طبي/u,
  /وزاره\s+الصحه/u,
  /وزاره\s+التجاره/u,
  /بشتكي\s+عليكم/u,
  /بروح\s+للاعلام/u,
  /بفضحكم/u,
  /تشهير/u,
]);

/**
 * Abuse/threat signal.
 *
 * No response policy is decided here.
 */
const ABUSE_OR_THREAT_PATTERNS = Object.freeze([
  /تهديد/u,
  /تحرش/u,
  /الفاظ\s+نابيه/u,
  /ألفاظ\s+نابية/u,
  /بقتلك/u,
  /بضرب/u,
]);

/**
 * Frustration directed specifically at Shaden/bot behavior.
 */
const BOT_FRUSTRATION_PATTERNS = Object.freeze([
  /انتي\s+غبيه/u,
  /انتي\s+غبية/u,
  /انت\s+غبي/u,
  /ما\s+تفهمين/u,
  /ما\s+تفهم/u,
  /بطيئه/u,
  /بطيئة/u,
  /ردودك\s+سيئه/u,
  /ردودك\s+سيئة/u,
]);

const POSITIVE_PATTERNS = Object.freeze([
  /ممتاز/u,
  /رائع/u,
  /جميل/u,
  /حلو/u,
  /شكرا/u,
  /يعطيك\s+العافيه/u,
  /يعطيك\s+العافية/u,
  /يعطيكم\s+العافيه/u,
  /يعطيكم\s+العافية/u,
  /تسلمين/u,
  /الله\s+يجزاك\s+خير/u,
]);

function detectSentiment({
  text,
  anger,
  frustration,
  complaint,
  worried,
  hesitation,
  objection,
}) {
  if (anger) {
    return 'angry';
  }

  if (frustration || complaint) {
    return 'frustrated';
  }

  if (worried || hesitation || objection) {
    return 'worried';
  }

  if (matchesAny(text, POSITIVE_PATTERNS)) {
    return 'positive';
  }

  return 'neutral';
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function safeSignals() {
  return Object.freeze({
    confirmation: false,
    rejection: false,
    correction: false,
    interruption: false,
    conditional: false,
    hesitation: false,
    objection: false,
    complaint: false,
    medicalQuestion: false,
    medicalRisk: false,
    humanHandover: false,
    abuseOrThreat: false,
    legalEscalation: false,
    botFrustration: false,
    sentiment: 'neutral',
  });
}

module.exports = ShadenConversationalSignalDetector;
