require('dotenv').config();

const requiredEnv = [
  'DATABASE_URL',
  'WHATSAPP_TOKEN',
  'VERIFY_TOKEN',
  'PHONE_NUMBER_ID',
  'WHATSAPP_RECOVERY_TEMPLATE_NAME'
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  databaseUrl: process.env.DATABASE_URL,

  whatsappMessageDebounceMs:
    Number.isFinite(Number(process.env.WHATSAPP_MESSAGE_DEBOUNCE_MS))
      ? Number(process.env.WHATSAPP_MESSAGE_DEBOUNCE_MS)
      : 2750,

  conversation: {
    enabled: String(process.env.SHADEN_SEMANTIC_CATALOG_SLICE_ENABLED || '')
      .trim().toLowerCase() === 'true',
    groqApiKey: process.env.GROQ_API_KEY || null,
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    verifyToken: process.env.VERIFY_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    recoveryTemplateName: process.env.WHATSAPP_RECOVERY_TEMPLATE_NAME
  },
  notifications: {
    intervalMs: Number(process.env.NOTIFICATION_INTERVAL_MS) || 60000,
    googleReviewDelayMinutes:
      Number(process.env.GOOGLE_REVIEW_DELAY_MINUTES) || 60
  }
};
