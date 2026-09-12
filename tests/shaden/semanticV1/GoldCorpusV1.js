'use strict';

module.exports = Object.freeze([
  {
    "id": "G01",
    "family": "direct_service",
    "currentMessage": "عندكم ليزر؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "عندكم ليزر",
          "meaning": "تسأل عن وجود خدمة أو علاج بالليزر"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "ليزر",
          "meaning": "خدمة أو علاج بالليزر",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G02",
    "family": "implicit_need",
    "currentMessage": "عندي بقع غامقة من الشمس، عندكم حاجة تساعد؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "عندكم حاجة تساعد",
          "meaning": "تسأل عن وجود خيار مناسب للمشكلة التي وصفتها"
        }
      ],
      "subjects": [
        {
          "kind": "NEED_OR_CONCERN",
          "surface": "بقع غامقة من الشمس",
          "meaning": "بقع أو تغير لون في الجلد مرتبط بالشمس",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G03",
    "family": "branch",
    "currentMessage": "فين فرع الحمدانية؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "فين فرع الحمدانية",
          "meaning": "تسأل عن موقع فرع الحمدانية"
        }
      ],
      "subjects": [
        {
          "kind": "BRANCH_OR_LOCATION",
          "surface": "فرع الحمدانية",
          "meaning": "فرع أو موقع باسم الحمدانية",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G04",
    "family": "insurance",
    "currentMessage": "تقبلون التعاونية؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "تقبلون التعاونية",
          "meaning": "تسأل هل يتم قبول التأمين المذكور"
        }
      ],
      "subjects": [
        {
          "kind": "PAYMENT_OR_INSURANCE",
          "surface": "التعاونية",
          "meaning": "اسم جهة تأمين مذكورة من العميل",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G05",
    "family": "date_time",
    "currentMessage": "فيه موعد ليزر بكرة بعد 6؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "فيه موعد ليزر بكرة بعد 6",
          "meaning": "تسأل عن توفر موعد لخدمة الليزر في الوقت المطلوب"
        }
      ],
      "subjects": [
        {
          "kind": "APPOINTMENT",
          "surface": "موعد",
          "meaning": "موعد أو فتحة حجز",
          "source": "CURRENT"
        },
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "ليزر",
          "meaning": "خدمة أو علاج بالليزر",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "DATE",
          "surface": "بكرة",
          "meaning": "تحدد اليوم التالي",
          "source": "CURRENT"
        },
        {
          "kind": "TIME",
          "surface": "بعد 6",
          "meaning": "تطلب وقتا بعد الساعة السادسة",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G06",
    "family": "negation_exclusion",
    "currentMessage": "عندي تصبغات ومش عايزة ليزر، فيه بديل؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "فيه بديل",
          "meaning": "تسأل عن خيار آخر مناسب مع استبعاد الليزر"
        }
      ],
      "subjects": [
        {
          "kind": "NEED_OR_CONCERN",
          "surface": "تصبغات",
          "meaning": "مشكلة تصبغ أو تغير في لون الجلد",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "NEGATIVE",
          "surface": "مش عايزة ليزر",
          "meaning": "تستبعد الخيارات التي تعتمد على الليزر",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G07",
    "family": "social",
    "currentMessage": "السلام عليكم",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "SOCIAL",
          "surface": "السلام عليكم",
          "meaning": "تحية"
        }
      ],
      "subjects": [],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G08",
    "family": "social",
    "currentMessage": "شكرا",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "SOCIAL",
          "surface": "شكرا",
          "meaning": "تعبير عن الشكر"
        }
      ],
      "subjects": [],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G09",
    "family": "unknown",
    "currentMessage": "شسعغ فغكض",
    "contextTurns": [],
    "expected": {
      "status": "UNKNOWN",
      "goals": [],
      "subjects": [],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G10",
    "family": "ambiguous",
    "currentMessage": "طيب هناك؟",
    "contextTurns": [],
    "expected": {
      "status": "AMBIGUOUS",
      "goals": [
        {
          "type": "ASK",
          "surface": "طيب هناك",
          "meaning": "يسأل عن شيء أو مكان غير محدد بما يكفي"
        }
      ],
      "subjects": [
        {
          "kind": "BRANCH_OR_LOCATION",
          "surface": "هناك",
          "meaning": "an unresolved reference to a location",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G11",
    "family": "context_followup",
    "currentMessage": "طيب والحمدانية؟",
    "contextTurns": [
      "عندكم فيلر في الصالحية؟"
    ],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "طيب والحمدانية",
          "meaning": "تسأل عن نفس الخدمة بالنسبة للحمدانية"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "فيلر",
          "meaning": "خدمة الفيلر المذكورة في السياق",
          "source": "CONTEXT"
        }
      ],
      "constraints": [
        {
          "kind": "LOCATION",
          "surface": "الحمدانية",
          "meaning": "تحدد الحمدانية كموقع السؤال الحالي",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": true,
        "evidence": [
          {
            "turn": -1,
            "surface": "فيلر"
          }
        ]
      }
    }
  },
  {
    "id": "G12",
    "family": "topic_change",
    "currentMessage": "عندي آثار حبوب قديمة، فيه علاج؟",
    "contextTurns": [
      "عندكم فيلر في الصالحية؟"
    ],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "فيه علاج",
          "meaning": "تسأل عن وجود خيار مناسب للمشكلة الجديدة"
        }
      ],
      "subjects": [
        {
          "kind": "NEED_OR_CONCERN",
          "surface": "آثار حبوب قديمة",
          "meaning": "آثار متبقية من حب الشباب",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G13",
    "family": "correction",
    "currentMessage": "لا قصدي الحمدانية",
    "contextTurns": [
      "عندكم فيلر في الصالحية؟"
    ],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "لا قصدي الحمدانية",
          "meaning": "correcting the location in the active request"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "فيلر",
          "meaning": "the service carried from required context",
          "source": "CONTEXT"
        }
      ],
      "constraints": [
        {
          "kind": "LOCATION",
          "surface": "الحمدانية",
          "meaning": "the replacement location stated now",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": true,
        "evidence": [
          {
            "turn": -1,
            "surface": "عندكم فيلر في الصالحية؟"
          }
        ]
      }
    }
  },
  {
    "id": "G14",
    "family": "compound",
    "currentMessage": "عندكم ليزر وفيلر في الحمدانية؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "عندكم ليزر وفيلر في الحمدانية",
          "meaning": "تسأل عن خدمتين في الموقع المذكور"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "ليزر",
          "meaning": "خدمة أو علاج بالليزر",
          "source": "CURRENT"
        },
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "فيلر",
          "meaning": "خدمة الفيلر",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "LOCATION",
          "surface": "الحمدانية",
          "meaning": "تحدد الحمدانية كموقع للسؤال",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G15",
    "family": "domain_unknown_but_understood",
    "currentMessage": "عندكم خدمة اسمها زولافين؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "عندكم خدمة اسمها زولافين",
          "meaning": "تسأل هل توجد خدمة بالاسم المذكور"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "زولافين",
          "meaning": "اسم خدمة أو علاج ذكره العميل",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G16",
    "family": "act_cancel",
    "currentMessage": "أبغى ألغي موعدي",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "أبغى ألغي موعدي",
          "meaning": "تطلب إلغاء موعدها"
        }
      ],
      "subjects": [
        {
          "kind": "APPOINTMENT",
          "surface": "موعدي",
          "meaning": "موعد العميل",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G17",
    "family": "act_reschedule",
    "currentMessage": "ممكن أغير موعدي لبكرة؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "أغير موعدي لبكرة",
          "meaning": "تطلب تغيير موعدها إلى اليوم التالي"
        }
      ],
      "subjects": [
        {
          "kind": "APPOINTMENT",
          "surface": "موعدي",
          "meaning": "موعد العميل",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "DATE",
          "surface": "بكرة",
          "meaning": "تحدد اليوم التالي كموعد مطلوب",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G18",
    "family": "act_change_branch",
    "currentMessage": "أبغى أغير الفرع للحمدانية",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "أبغى أغير الفرع للحمدانية",
          "meaning": "تطلب تغيير الفرع إلى الحمدانية"
        }
      ],
      "subjects": [
        {
          "kind": "BRANCH_OR_LOCATION",
          "surface": "الفرع",
          "meaning": "الفرع المرتبط بالطلب",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "LOCATION",
          "surface": "للحمدانية",
          "meaning": "الموقع المطلوب الانتقال إليه",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G19",
    "family": "act_change_provider",
    "currentMessage": "أبغى دكتورة ثانية",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "أبغى دكتورة ثانية",
          "meaning": "تطلب مقدمة خدمة مختلفة"
        }
      ],
      "subjects": [
        {
          "kind": "PROVIDER",
          "surface": "دكتورة",
          "meaning": "a female provider",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "PREFERENCE",
          "surface": "ثانية",
          "meaning": "preference for a different provider",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G20",
    "family": "implicit_need",
    "currentMessage": "وجهي فيه آثار حبوب قديمة، فيه حاجة تساعد؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "فيه حاجة تساعد",
          "meaning": "تسأل عن خيار مناسب للمشكلة المذكورة"
        }
      ],
      "subjects": [
        {
          "kind": "NEED_OR_CONCERN",
          "surface": "آثار حبوب قديمة",
          "meaning": "آثار متبقية من حب الشباب",
          "source": "CURRENT"
        }
      ],
      "constraints": [],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G21",
    "family": "preference",
    "currentMessage": "عندكم شيء خفيف للبشرة؟",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "عندكم شيء خفيف للبشرة",
          "meaning": "تسأل عن خيار بسيط أو خفيف للبشرة"
        }
      ],
      "subjects": [
        {
          "kind": "NEED_OR_CONCERN",
          "surface": "للبشرة",
          "meaning": "احتياج عام متعلق بالبشرة دون تحديد مشكلة أو خدمة",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "PREFERENCE",
          "surface": "خفيف",
          "meaning": "تفضل خيارا خفيفا أو بسيطا",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G22",
    "family": "quantity",
    "currentMessage": "أبغى أحجز جلستين ليزر",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "أبغى أحجز جلستين ليزر",
          "meaning": "تطلب حجز جلستين لخدمة الليزر"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "ليزر",
          "meaning": "خدمة أو علاج بالليزر",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "QUANTITY",
          "surface": "جلستين",
          "meaning": "تحدد الكمية بجلستين",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G23",
    "family": "stated_condition",
    "currentMessage": "أنا حامل وعايزة ليزر إزالة شعر",
    "contextTurns": [],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ACT",
          "surface": "عايزة ليزر إزالة شعر",
          "meaning": "تريد خدمة إزالة الشعر بالليزر"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "ليزر إزالة شعر",
          "meaning": "خدمة إزالة الشعر بالليزر",
          "source": "CURRENT"
        }
      ],
      "constraints": [
        {
          "kind": "OTHER",
          "surface": "حامل",
          "meaning": "ذكرت أنها حامل دون استنتاج طبي",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": false,
        "evidence": []
      }
    }
  },
  {
    "id": "G24",
    "family": "context_pronoun",
    "currentMessage": "طيب هناك؟",
    "contextTurns": [
      "عندكم فيلر في الصالحية؟"
    ],
    "expected": {
      "status": "UNDERSTOOD",
      "goals": [
        {
          "type": "ASK",
          "surface": "طيب هناك",
          "meaning": "تسأل عن نفس الخدمة في المكان المشار إليه من السياق"
        }
      ],
      "subjects": [
        {
          "kind": "SERVICE_OR_TREATMENT",
          "surface": "فيلر",
          "meaning": "the filler service mentioned in context",
          "source": "CONTEXT"
        }
      ],
      "constraints": [
        {
          "kind": "LOCATION",
          "surface": "هناك",
          "meaning": "the location referred to from context",
          "source": "CURRENT"
        }
      ],
      "context": {
        "used": true,
        "evidence": [
          {
            "turn": -1,
            "surface": "فيلر"
          },
          {
            "turn": -1,
            "surface": "الصالحية"
          }
        ]
      }
    }
  }
]);
