// app/services/telegramMicroservice.service.js
const MICROSERVICE_URL = process.env.TELEGRAM_MICROSERVICE_URL;

export async function fetchTelegramNames(phone) {
  if (!MICROSERVICE_URL) {
    throw new Error('TELEGRAM_MICROSERVICE_URL not set');
  }

  const response = await fetch(`${MICROSERVICE_URL}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return {
    name1: data.name1,
    name2: data.name2,
  };
}