/**
 * Meesho Live API Client & Auth Provider
 * Reverse-engineered endpoints for Meesho Web OTP & Session Management
 * 
 * Endpoints:
 * 1. Request OTP: POST https://www.meesho.com/api/v1/user/login/request-otp
 * 2. Verify & Login: POST https://www.meesho.com/api/v1/user/login
 */

const crypto = require('crypto');

const MEESHO_BASE = 'https://www.meesho.com';
const REQUEST_OTP_URL = `${MEESHO_BASE}/api/v1/user/login/request-otp`;
const LOGIN_VERIFY_URL = `${MEESHO_BASE}/api/v1/user/login`;

const DEFAULT_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://www.meesho.com',
  'Referer': 'https://www.meesho.com/auth/verify?redirect=https%3A%2F%2Fwww.meesho.com%2F&source=profile&entry=header&screen=HP',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin'
};

/**
 * Parse raw cookie string or JSON into structured session info
 */
function parseCookieString(raw) {
  if (!raw || typeof raw !== 'string') return {};
  
  const result = {
    raw: raw.trim(),
    userId: null,
    connectSid: null,
    isLoggedIn: false,
    mobile: null
  };

  // Try JSON parse if user pasted JSON format
  try {
    const parsed = JSON.parse(raw);
    if (parsed.user_id || parsed.userId) result.userId = String(parsed.user_id || parsed.userId);
    if (parsed.mobile || parsed.phone) result.mobile = String(parsed.mobile || parsed.phone);
    if (parsed.session || parsed['__connect.sid__']) result.connectSid = String(parsed.session || parsed['__connect.sid__']);
    if (parsed.isLoggedIn !== undefined) result.isLoggedIn = !!parsed.isLoggedIn;
    return result;
  } catch (e) {
    // Plain cookie string
  }

  // Extract __logged_in_user_id__
  const userIdMatch = raw.match(/__logged_in_user_id__=([^;]+)/i);
  if (userIdMatch) {
    result.userId = userIdMatch[1].trim();
    result.isLoggedIn = true;
  }

  // Extract __connect.sid__
  const sidMatch = raw.match(/__connect\.sid__=([^;]+)/i);
  if (sidMatch) {
    result.connectSid = sidMatch[1].trim();
  }

  // Extract _is_logged_in_
  const loginMatch = raw.match(/_is_logged_in_=([^;]+)/i);
  if (loginMatch && loginMatch[1] === '1') {
    result.isLoggedIn = true;
  }

  // Extract mobile if embedded
  const mobMatch = raw.match(/"?mobile"?\s*[:=]\s*"?(\d{10})"?/i);
  if (mobMatch) {
    result.mobile = mobMatch[1];
  }

  return result;
}

/**
 * Request real SMS OTP from Meesho
 * @param {string} phoneNumber 10-digit mobile number
 * @param {object} [options] optional cookies and custom headers
 */
async function requestOtp(phoneNumber, options = {}) {
  const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    throw new Error('Invalid phone number: must be 10 digits');
  }

  const headers = { ...DEFAULT_HEADERS };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }

  const payload = {
    phone_number: cleanPhone
  };

  try {
    const res = await fetch(REQUEST_OTP_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    const setCookies = res.headers.get('set-cookie') || '';

    return {
      status: res.status,
      ok: res.ok,
      data: bodyJson || bodyText,
      cookies: setCookies,
      requestId: bodyJson?.request_id || null
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      error: err.message
    };
  }
}

/**
 * Verify OTP & Login on Meesho
 * @param {object} params
 * @param {string} params.phoneNumber 10-digit mobile
 * @param {string} params.otp 6-digit OTP code
 * @param {string} [params.requestId] request_id returned by request-otp
 * @param {string} [params.instanceId] UUID instance ID (generated if not provided)
 * @param {string} [params.cookies] session cookies
 */
async function verifyOtp({ phoneNumber, otp, requestId, instanceId, cookies = '' }) {
  const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
  const cleanOtp = String(otp || '').trim();

  if (cleanPhone.length !== 10) throw new Error('Invalid phone number');
  if (!cleanOtp) throw new Error('Invalid OTP');

  const payload = {
    instance_id: instanceId || crypto.randomUUID(),
    login_type: 'meesho_sms_auth',
    otp: cleanOtp,
    phone_number: cleanPhone,
    request_id: requestId || ''
  };

  const headers = { ...DEFAULT_HEADERS };
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  try {
    const res = await fetch(LOGIN_VERIFY_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    const setCookies = res.headers.get('set-cookie') || '';
    const parsedCookies = parseCookieString(setCookies);

    return {
      status: res.status,
      ok: res.ok,
      data: bodyJson || bodyText,
      setCookies: setCookies,
      parsedSession: parsedCookies,
      userId: parsedCookies.userId || bodyJson?.user_id || null
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      error: err.message
    };
  }
}

module.exports = {
  REQUEST_OTP_URL,
  LOGIN_VERIFY_URL,
  DEFAULT_HEADERS,
  parseCookieString,
  requestOtp,
  verifyOtp
};
