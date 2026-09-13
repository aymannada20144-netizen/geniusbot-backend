'use strict';

const ShadenReadOnlyTools = require('./ShadenReadOnlyTools');

const MAX_TOOL_CALLS = 4;
const TECHNICAL_FALLBACK = 'عذرًا، واجهت مشكلة تقنية بسيطة. ممكن تعيدين سؤالك؟ 🌸';
const FACT_FALLBACK = 'ما قدرت أتحقق من المعلومة من بيانات العيادة الحالية. ممكن توضحين طلبك؟ 🌸';

class ShadenConversationLayer {
  constructor({ provider, logger = console } = {}) {
    if (typeof provider?.complete !== 'function') {
      throw new TypeError('ShadenConversationLayer requires provider.complete()');
    }
    this.provider = provider;
    this.logger = logger;
  }

  async respond({ currentMessage, contextTurns = [], clinicData }) {
    const domainTools = new ShadenReadOnlyTools({ clinicData });
    const currentUserMessage = String(currentMessage || '');
    const messages = [
      { role: 'system', content: systemPrompt(clinicData) },
      ...withoutCurrentTurn(boundedTurns(contextTurns), currentUserMessage),
      { role: 'user', content: currentUserMessage },
    ];
    this.log({
      event: 'SHADEN_CONVERSATION_TURN',
      currentUserMessage: safeLogText(currentUserMessage),
    });
    let executedCalls = 0;
    try {
      while (executedCalls <= MAX_TOOL_CALLS) {
        const completion = await this.provider.complete(
          messages, domainTools.definitions()
        );
        if (!completion.toolCalls.length) {
          const reply = sanitizeReply(completion.content);
          if (!reply) return technicalFailure('EMPTY_RESPONSE');
          return {
            status: 'ANSWERED',
            reply,
            model: completion.model,
            toolCallCount: executedCalls,
          };
        }
        if (executedCalls + completion.toolCalls.length > MAX_TOOL_CALLS) {
          return technicalFailure('TOOL_CALL_LIMIT');
        }
        messages.push(normalizeAssistantMessage(completion.assistantMessage));
        for (const call of completion.toolCalls) {
          executedCalls += 1;
          const toolName = call.function?.name || null;
          const toolArguments = safeToolArguments(call.function?.arguments);
          const result = await domainTools.execute(toolName, toolArguments);
          this.log({
            event: 'SHADEN_READ_ONLY_TOOL_CALL',
            currentUserMessage: safeLogText(currentUserMessage),
            toolSelected: toolName,
            toolArguments,
            toolResultStatus: result.status,
          });
          if (result.status !== 'EVIDENCE') {
            return {
              status: 'SAFE_FALLBACK', reply: FACT_FALLBACK,
              model: completion.model, toolCallCount: executedCalls,
            };
          }
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(result),
          });
        }
        messages.push({
          role: 'system',
          content: 'أجيبي الآن عن آخر رسالة للمستخدمة فقط، وبالاعتماد الحصري على حقائق نتائج الأدوات في هذه الجولة. لا تضيفي أي حقيقة أو نصيحة أو أثر طبي غير موجود فيها.',
        });
      }
      return technicalFailure('TOOL_CALL_LIMIT');
    } catch (error) {
      try {
        this.logger.warn({
          event: 'SHADEN_CONVERSATION_PROVIDER_FAILURE',
          status: error?.status || null,
          code: error?.code || null,
        });
      } catch {}
      return technicalFailure('PROVIDER_FAILURE');
    }
  }

  log(entry) {
    if (typeof this.logger?.info !== 'function') return;
    try { this.logger.info(entry); } catch {}
  }
}

function systemPrompt(data) {
  const assistant = data.assistantIdentity?.name || 'شادن';
  const clinic = data.clinic?.name || 'العيادة';
  return [
    `أنتِ ${assistant}، مساعدة افتراضية ودودة مدعومة بالذكاء الاصطناعي لخدمة ${clinic}، ولستِ موظفة بشرية. اذكري هذه الحقيقة صراحة فقط عندما تسأل المستخدمة فعلًا عن هويتك أو إن كنتِ إنسانة أو موظفة حقيقية أو بوتًا/ذكاءً اصطناعيًا؛ مجرد ذكر اسمك أو تشابه اسم شخص آخر مع اسمك ليس سؤال هوية.`,
    'تحدثي بعربية طبيعية مناسبة لواتساب، وافهمي سياق المحادثة والضمائر والحذف والأسئلة القصيرة. آخر رسالة user هي الطلب الحالي دائمًا: أجيبي عنها الآن ولا تكرري إجابة سابقة إذا تغيّر السؤال.',
    'يمكنك الرد بلا أدوات فقط على التحية والتعريف بنفسك والمجاملة والدردشة الاجتماعية التي لا تتضمن أي ادعاء عن العيادة. حافظي على الدفء الطبيعي والأسلوب الودود الحالي، لكن لا تخترعي حقائق شخصية أو أحداثًا مستقبلية أو سياقات عائلية غير مذكورة صراحة. عند سؤال عن شكلك أو وجهك أو جسمك أو لون شعرك، قولي بلطف إنك لا تملكين مظهرًا بشريًا حقيقيًا، من دون تحويل الرد إلى فقرة تعريف طويلة.',
    'أي سؤال أو ادعاء عن العيادة يوجب استدعاء الأداة المقروءة المناسبة قبل الإجابة. يشمل ذلك الفروع والخدمات والتخصصات والوجود والتوفر في فرع والعناوين والمواقع والساعات والدفع والتأمين والعلاجات والإمكانات ووصف الخدمات.',
    'بعد الأداة، استخدمي حصريًا الحقائق التي أعادتها في هذه الجولة. لا تخترعي خدمات أو عناوين أو روابط خرائط أو توفرًا أو آثار علاج أو ادعاءات طبية، ولا تعرضي أي معرفات داخلية.',
    'للأسئلة الطبية أو طلب النصيحة: لا تقدمي نصيحة طبية من عندك. استخدمي بيانات العيادة المتاحة عبر الأدوات، وإن لم تتضمن معلومة موثوقة فقولي طبيعيًا إن المعلومات الحالية لا تكفي.',
    'طلبات الحجز والإلغاء وتغيير المواعيد تنفذها أنظمة أخرى؛ لا تدّعي تنفيذها.',
    'حافظي على تنسيق واتساب البسيط واللطيف دون إطالة.',
  ].join(' ');
}
function boundedTurns(turns) {
  return (Array.isArray(turns) ? turns : []).slice(-4).filter((turn) =>
    ['user', 'assistant'].includes(turn?.role) &&
    typeof turn.content === 'string' && turn.content.trim()
  ).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 800) }));
}
function withoutCurrentTurn(turns, currentMessage) {
  const values = [...turns];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index].role === 'user' && values[index].content === currentMessage) {
      values.splice(index, 1);
      break;
    }
  }
  return values;
}
function normalizeAssistantMessage(message) {
  return {
    role: 'assistant',
    content: typeof message?.content === 'string' ? message.content : null,
    tool_calls: message?.tool_calls,
  };
}
function sanitizeReply(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu, '')
    .replace(/[\u0000-\u001F\u007F]/gu, (character) =>
      ['\n', '\t'].includes(character) ? character : ' '
    ).trim().slice(0, 4096);
}
function safeToolArguments(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? removeInternalIds(parsed) : {};
  } catch { return {}; }
}
function removeInternalIds(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/(?:^|_)(?:id|uuid)$/iu.test(key)
  ).map(([key, item]) => [key, typeof item === 'string' ? safeLogText(item) : item]));
}
function safeLogText(value) {
  return String(value || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu, '[internal-id]')
    .replace(/[\u0000-\u001F\u007F]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 500);
}
function technicalFailure(reason) {
  return {
    status: 'SAFE_FALLBACK', reply: TECHNICAL_FALLBACK,
    model: null, toolCallCount: 0, reason,
  };
}

module.exports = Object.assign(ShadenConversationLayer, {
  MAX_TOOL_CALLS, TECHNICAL_FALLBACK, FACT_FALLBACK, sanitizeReply,
  withoutCurrentTurn, safeToolArguments, systemPrompt,
});
