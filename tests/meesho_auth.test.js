const assert = require('assert');
const meeshoClient = require('../backend/meesho_client');

console.log('🧪 Testing Meesho Client & Auth Parsing...\n');

// Test 1: Real Cookie String Parsing (from user screenshot)
const sampleCookie = '__logged_in_user_id__=362357864; Path=/; _is_logged_in_=1; Path=/; __connect.sid__=s%3Atq7-HzKY_1XHIXk8uoI_iKBLkUGdkhZL.w31XkIeyvAUHJh1tcOucrw; Path=/';

const parsed = meeshoClient.parseCookieString(sampleCookie);
console.log('Parsed Cookie:', parsed);

assert.strictEqual(parsed.userId, '362357864', 'Should extract real user id');
assert.strictEqual(parsed.isLoggedIn, true, 'Should detect is logged in');
assert.ok(parsed.connectSid.includes('tq7-HzKY'), 'Should extract connect.sid');

console.log('✅ Test 1: Cookie parsing works perfectly!');

// Test 2: Verify Endpoints URLs
assert.strictEqual(meeshoClient.REQUEST_OTP_URL, 'https://www.meesho.com/api/v1/user/login/request-otp');
assert.strictEqual(meeshoClient.LOGIN_VERIFY_URL, 'https://www.meesho.com/api/v1/user/login');
console.log('✅ Test 2: Reverse-engineered Meesho URLs are configured!');

console.log('\n🎉 All Meesho Auth Tests Passed!\n');
