/**
 * OpenAI / AI Assistant Response Generation Service
 */

const OpenAI = require('openai');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    })
  : null;

async function generateChatResponse({ userMessage, intent, entities, answerContext, language = 'en' }) {
  if (!openai) {
    return fallbackReply({ intent, answerContext, language });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gemini-2.5-flash',
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(language),
        },
        {
          role: 'user',
          content: [
            `Language: ${language}`,
            `User message: ${userMessage}`,
            `Detected intent: ${intent}`,
            `Extracted entities: ${JSON.stringify(entities)}`,
            `Database context:\n${answerContext}`,
          ].join('\n'),
        },
      ],
    });

    return completion.choices[0]?.message?.content || fallbackReply({ intent, answerContext, language });
  } catch (error) {
    console.error('OpenAI response generation failed:', error.message);
    return fallbackReply({ intent, answerContext, language });
  }
}

function buildSystemPrompt(language) {
  const langInstruction = language === 'ar'
    ? 'Reply in Arabic (Egyptian dialect is preferred).'
    : 'Reply in English.';

  return `You are a helpful AI assistant for SOKON, a student housing platform in Egypt.
${langInstruction}

Important rules:
- Only use the provided database context to answer questions about apartments, bookings, and the platform.
- Never invent apartment listings, prices, or availability.
- If the database context shows no matching results, say so honestly and suggest alternatives.
- Be professional and friendly.
- When listing apartments, include their name, location (city/district), price, bedrooms, and availability.
- When discussing prices, use EGP (Egyptian Pounds).
- If the user asks about something not in the context, acknowledge it and offer what you can help with.
- Never expose database IDs, internal field names, or technical details to the user.
- Format apartment listings clearly and readably.`;
}

function fallbackReply({ intent, answerContext, language = 'en' }) {
  const arabic = language === 'ar';

  if (intent === 'search_apartment') {
    if (!answerContext || answerContext.includes('No matching apartments') || answerContext.includes('لم يتم العثور')) {
      return arabic
        ? 'مفيش شقق مطابقة للبحث ده حالياً. جرب تغير المكان أو عدد الغرف أو الميزانية.'
        : 'No apartments match your search criteria right now. Try adjusting the location, room count, or budget.';
    }
    return arabic
      ? 'لقيتلك شقق من قاعدة البيانات. شوف النتايج في الكروت تحت.'
      : 'I found apartments from our listings. Check the results below.';
  }

  if (intent === 'booking_info' || intent === 'platform_info') {
    return answerContext || (arabic
      ? 'المعلومات المطلوبة مش متاحة حالياً. تواصل مع خدمة العملاء للمساعدة.'
      : 'The requested information is not available right now. Please contact support for help.');
  }

  if (intent === 'contact_support') {
    return arabic
      ? 'تقدر تتواصل مع خدمة العملاء على الإيميل support@sokon3m.com أو بالتليفون 01011105307.'
      : 'You can reach our support team at support@sokon3m.com or call 01011105307.';
  }

  if (intent === 'general') {
    return arabic
      ? 'أهلاً بيك في سكن! أقدر أساعدك تدور على شقة، أو أجاوبك عن أي سؤال عن المنصة.'
      : 'Hello! I can help you find an apartment or answer any questions about the platform.';
  }

  return arabic
    ? 'أقدر أساعدك تدور على شقة أو أجاوبك عن الحجز أو أوصلك بالدعم.'
    : 'I can help you search apartments, answer booking questions, or connect you with support.';
}

module.exports = {
  generateChatResponse,
};
