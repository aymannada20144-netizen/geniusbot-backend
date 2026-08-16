require('dotenv').config();

const requiredEnv = [
  'DATABASE_URL',
  'GROQ_API_KEY',
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

  groqApiKey: process.env.GROQ_API_KEY,
  groqSemanticModel:
    process.env.GROQ_SEMANTIC_MODEL || 'openai/gpt-oss-20b',

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
