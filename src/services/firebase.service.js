const fs = require('fs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function getServiceAccount() {
  try {
    let sa = null;
    let jsonStr = env.firebase.serviceAccountJson;

    if (jsonStr) {
      // Clean up the string in case it's wrapped in extra quotes from Render UI
      jsonStr = jsonStr.trim();
      if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
        jsonStr = jsonStr.substring(1, jsonStr.length - 1);
      }

      // If it looks like an escaped string (contains \n as text), unescape it
      if (jsonStr.includes('\\n')) {
        // This handles cases where the whole JSON is an escaped string
        try {
          // If it's valid JSON that was stringified into a string variable
          sa = JSON.parse(jsonStr);
        } catch (e) {
          // If it's not valid JSON yet, it might be a double-escaped string
          // We manually unescape the common characters
          jsonStr = jsonStr.replace(/\\n/g, '\n').replace(/\\"/g, '"');
          sa = JSON.parse(jsonStr);
        }
      } else {
        sa = JSON.parse(jsonStr);
      }
    } else if (env.firebase.serviceAccountPath) {
      sa = JSON.parse(fs.readFileSync(env.firebase.serviceAccountPath, 'utf8'));
    }

    if (sa && sa.private_key && typeof sa.private_key === 'string') {
      // Final safety check for the private key format
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');

      // Ensure the key starts and ends correctly
      if (!sa.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
        console.error('Firebase private key is missing header');
      }
    }

    return sa;
  } catch (error) {
    console.error('Failed to parse Firebase Service Account:', error.message);
    return null;
  }
}

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60 > now) {
    return cachedAccessToken;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key || !serviceAccount?.token_uri) {
    return null;
  }

  const assertion = jwt.sign(
    {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
    {
      algorithm: 'RS256',
      header: { typ: 'JWT' },
    },
  );

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + Number(data.expires_in || 3600);
  return cachedAccessToken;
}

async function sendPushToToken({ token, title, body, data = {}, imageUrl }) {
  const projectId = env.firebase.projectId;
  if (!projectId || !token) {
    return { sent: false, reason: !projectId ? 'missing_firebase_project_id' : 'missing_fcm_token' };
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { sent: false, reason: 'missing_firebase_service_account' };
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title,
            body,
            ...(imageUrl ? { image: imageUrl } : {}),
          },
          data: Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, value == null ? '' : String(value)]),
          ),
          android: {
            priority: 'high',
            notification: {
              channel_id: 'high_importance_channel',
              ...(imageUrl ? { image: imageUrl } : {}),
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FCM send failed: ${response.status} ${text}`);
  }

  return { sent: true, response: await response.json() };
}

module.exports = { sendPushToToken };
