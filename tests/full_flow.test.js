/**
 * Full End-to-End User Flow Test
 * Tests: Signup -> Feed -> Product Card -> Cart -> Address -> Order -> History
 */

const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const USER_KEY = 'test_user_' + Date.now();

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-key': USER_KEY
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('🚀 Running Full E2E Flow Test...\n');

  // Step 1: Signup & Send OTP
  console.log('1️⃣ Sending OTP for new user...');
  const sendRes = await request('POST', '/api/signup/send-otp', { phone: '9876543210' });
  assert.strictEqual(sendRes.data.ok, true, 'OTP send should succeed');
  const testOtp = sendRes.data.debug_otp;
  console.log('   ✅ OTP generated:', testOtp);

  // Step 2: Verify OTP & Create Account
  console.log('2️⃣ Verifying OTP & activating account with ₹170 balance...');
  const verifyRes = await request('POST', '/api/signup/verify', { otp: testOtp, phone: '9876543210' });
  assert.strictEqual(verifyRes.data.ok, true, 'OTP verify should succeed');
  assert.strictEqual(verifyRes.data.account.wallet.balance, 170, 'Should have ₹170 balance');
  console.log('   ✅ Account created with ₹170 balance!');

  // Step 3: Product Feed (For You)
  console.log('3️⃣ Loading Meesho Product Feed...');
  const feedRes = await request('GET', '/api/meesho/for-you?limit=6');
  assert.strictEqual(feedRes.data.ok, true, 'Feed should load');
  assert.ok(feedRes.data.products.length > 0, 'Products should not be empty');
  const firstProduct = feedRes.data.products[0];
  console.log(`   ✅ Loaded ${feedRes.data.products.length} products (First: ${firstProduct.name})`);

  // Step 4: Product Card Details, Reviews & Recommendations
  console.log('4️⃣ Testing Product Card details, reviews & recommendations...');
  const prodRes = await request('GET', `/api/product?id=${firstProduct.id}`);
  assert.strictEqual(prodRes.data.ok, true, 'Product detail should load');

  const revRes = await request('GET', `/api/meesho/reviews/${firstProduct.id}`);
  assert.strictEqual(revRes.data.ok, true, 'Reviews should load');
  assert.ok(revRes.data.data.reviews_with_image.length > 0, 'Should have reviews');

  const recRes = await request('POST', '/api/meesho/recommendations', { product_id: firstProduct.id });
  assert.strictEqual(recRes.data.ok, true, 'Recommendations should load');
  console.log('   ✅ Product card, reviews and recommendations loaded!');

  // Step 5: Cart Operations & ₹170 Discount Calculation
  console.log('5️⃣ Testing Cart & ₹170 discount calculation...');
  const addRes = await request('POST', '/api/cart/add', { product_id: firstProduct.id, quantity: 1, size: 'Free Size' });
  assert.strictEqual(addRes.data.ok, true, 'Add to cart should succeed');

  const cartRes = await request('GET', '/api/cart');
  assert.strictEqual(cartRes.data.ok, true, 'Cart should load');
  assert.strictEqual(cartRes.data.items.length, 1, 'Cart should have 1 item');

  const priceRes = await request('POST', '/api/order/prices');
  assert.strictEqual(priceRes.data.ok, true, 'Prices should compute');
  console.log('   Subtotal:', priceRes.data.price_break_up[0].value);
  console.log('   Discount:', priceRes.data.price_break_up[1].value);
  console.log('   Final Payable:', priceRes.data.cod);
  assert.ok(priceRes.data.price_break_up[1].value < 0, '₹170 discount should be negative');
  console.log('   ✅ Cart operations & ₹170 discount verified!');

  // Step 6: Address Operations (Create, Geocode, Set Default)
  console.log('6️⃣ Testing Address management & Geocode...');
  const geoRes = await request('GET', '/api/geocode?lat=28.6139&lng=77.2090');
  assert.strictEqual(geoRes.data.ok, true, 'Geocode should work');

  const addrRes = await request('POST', '/api/addresses/create', {
    name: 'Rohan Sharma',
    phone: '9876543210',
    house_no: 'Flat 101, Galaxy Heights',
    street: 'MG Road',
    pincode: '110001',
    city: 'New Delhi',
    state: 'Delhi',
    is_default: true
  });
  assert.strictEqual(addrRes.data.ok, true, 'Address creation should succeed');
  const newAddrId = addrRes.data.address.id;

  const locRes = await request('POST', '/api/cart/location', { address_id: newAddrId, dest_pin: '110001' });
  assert.strictEqual(locRes.data.ok, true, 'Cart location should update');
  console.log('   ✅ Address created & mapped to cart delivery!');

  // Step 7: Order Placement (COD)
  console.log('7️⃣ Placing COD Order with ₹170 discount...');
  const orderRes = await request('POST', '/api/order/place_cod');
  assert.strictEqual(orderRes.data.ok, true, 'Order placement should succeed');
  const orderNum = orderRes.data.order_num;
  console.log('   ✅ COD Order placed successfully! Order ID:', orderNum);

  // Step 8: Order Tracking & Details
  console.log('8️⃣ Verifying Order in Order History...');
  const ordersListRes = await request('GET', '/api/orders');
  assert.strictEqual(ordersListRes.data.ok, true, 'Orders list should return');
  assert.ok(ordersListRes.data.orders.some(o => o.order_num === orderNum), 'Placed order should be in list');

  const orderDetailRes = await request('GET', `/api/orders/detail?order_num=${orderNum}`);
  assert.strictEqual(orderDetailRes.data.ok, true, 'Order detail should return');
  assert.strictEqual(orderDetailRes.data.order.order_num, orderNum, 'Order number match');
  console.log('   ✅ Order verified in history & details!');

  // Step 9: Order Cancellation
  console.log('9️⃣ Testing Order Cancellation flow...');
  const cancelReasonsRes = await request('GET', `/api/orders/cancel_reasons?order_num=${orderNum}`);
  assert.strictEqual(cancelReasonsRes.data.ok, true, 'Cancel reasons should return');

  const cancelRes = await request('POST', '/api/orders/cancel', { order_num: orderNum, comments: 'Test cancellation' });
  assert.strictEqual(cancelRes.data.ok, true, 'Cancel should succeed');
  console.log('   ✅ Order cancellation working!');

  // Step 10: Wallet & FOD Offer
  console.log('🔟 Testing Wallet History & FOD...');
  const walletRes = await request('GET', '/api/wallet/history');
  assert.strictEqual(walletRes.data.ok, true, 'Wallet history should return');

  const fodRes = await request('GET', '/api/account/fod');
  assert.strictEqual(fodRes.data.ok, true, 'FOD offer should return');
  console.log('   ✅ Wallet & FOD offers working!');

  console.log('\n🎉 ALL 10 E2E TEST PHASES PASSED SUCCESSFULLY!\n');
}

// Start server and run tests
const server = spawn('node', ['backend/server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
setTimeout(async () => {
  try {
    await run();
    server.kill();
    process.exit(0);
  } catch (err) {
    console.error('❌ E2E TEST FAILED:', err);
    server.kill();
    process.exit(1);
  }
}, 2000);
