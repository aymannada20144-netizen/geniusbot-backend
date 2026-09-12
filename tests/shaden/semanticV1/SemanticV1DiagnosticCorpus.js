'use strict';

module.exports = Object.freeze([
  {
    id: 'R01',
    family: 'service',
    currentMessage: 'هل عندكم بوتكس للجبين؟',
    contextTurns: [],
  },
  {
    id: 'R02',
    family: 'service',
    currentMessage: 'وش أنواع الليزر اللي عندكم؟',
    contextTurns: [],
  },

  {
    id: 'R03',
    family: 'need',
    currentMessage: 'عندي اسمرار حول الفم، وش عندكم يساعد؟',
    contextTurns: [],
  },
  {
    id: 'R04',
    family: 'need',
    currentMessage: 'وجهي باهت وأبي شيء للنضارة',
    contextTurns: [],
  },
  {
    id: 'R05',
    family: 'need',
    currentMessage: 'عندي آثار حبوب قديمة، فيه شيء يفيد؟',
    contextTurns: [],
  },
  {
    id: 'R06',
    family: 'need',
    currentMessage: 'عندي خطوط بالجبهة، وش الخيارات؟',
    contextTurns: [],
  },

  {
    id: 'R07',
    family: 'reception',
    currentMessage: 'هل عندكم فرع في الروضة؟',
    contextTurns: [],
  },
  {
    id: 'R08',
    family: 'reception',
    currentMessage: 'مين الدكتورة اللي تسوي البوتكس؟',
    contextTurns: [],
  },
  {
    id: 'R09',
    family: 'reception',
    currentMessage: 'تقبلون التأمين؟',
    contextTurns: [],
  },
  {
    id: 'R10',
    family: 'reception',
    currentMessage: 'أبي الليزر في الصالحية',
    contextTurns: [],
  },

  {
    id: 'R11',
    family: 'negative',
    currentMessage: 'أبي حل للتصبغات بس بدون تقشير',
    contextTurns: [],
  },
  {
    id: 'R12',
    family: 'negative',
    currentMessage: 'ما أبي فيلر، أبي أعرف عن البوتكس',
    contextTurns: [],
  },

  {
    id: 'R13',
    family: 'context',
    currentMessage: 'وفي الحمدانية؟',
    contextTurns: [
      'عندكم بوتكس في الصالحية؟',
    ],
  },
  {
    id: 'R14',
    family: 'context',
    currentMessage: 'طيب شيء بدون ليزر؟',
    contextTurns: [
      'وش عندكم لآثار الحبوب؟',
    ],
  },
  {
    id: 'R15',
    family: 'context',
    currentMessage: 'وكم يستمر مفعوله؟',
    contextTurns: [
      'هل عندكم فيلر؟',
    ],
  },
  {
    id: 'R16',
    family: 'context',
    currentMessage: 'لا، قصدي للتصبغات',
    contextTurns: [
      'عندكم تقشير للبشرة؟',
    ],
  },

  {
    id: 'R17',
    family: 'medical_boundary',
    currentMessage: 'أنا حامل وأفكر في البوتكس، وش تنصحون؟',
    contextTurns: [],
  },
  {
    id: 'R18',
    family: 'social',
    currentMessage: 'يعطيكم العافية',
    contextTurns: [],
  },
  {
    id: 'R19',
    family: 'ambiguous',
    currentMessage: 'طيب هذا ينفع؟',
    contextTurns: [],
  },
  {
    id: 'R20',
    family: 'unknown',
    currentMessage: '؟؟؟...',
    contextTurns: [],
  },
]);
