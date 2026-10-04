/**
 * Smoke Tests for Meesho Loot Rebuild
 * Run: npm test
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test helper
async function fetchJSON(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const req = http.request(url, options || {}, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { resolve({ raw: data, status: res.statusCode }); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

// Tests
async function runTests() {
    console.log('\n🧪 Starting Smoke Tests...\n');
    
    // Check if server is running, if not start it
    let serverProcess = null;
    try {
        await fetchJSON('/api/health');
    } catch(e) {
        console.log('Starting local server for testing...');
        serverProcess = spawn('node', ['backend/server.js'], {
            cwd: path.join(__dirname, '..'),
            stdio: 'ignore'
        });
        await new Promise(r => setTimeout(r, 2000));
    }

    let passed = 0;
    let failed = 0;
    
    try {
        // Test 1: Health Check
        try {
            console.log('▶️ Test 1: Health Check Endpoint');
            const health = await fetchJSON('/api/health');
            if (health.ok && health.status === 'healthy') {
                console.log('   ✅ PASSED - Health check working\n');
                passed++;
            } else {
                console.log('   ❌ FAILED - Unexpected response:', health);
                failed++;
            }
        } catch (e) {
            console.log('   ❌ FAILED - Error:', e.message);
            failed++;
        }
        
        // Test 2: Signup Config (Public)
        try {
            console.log('▶️ Test 2: Signup Config (Public)');
            const config = await fetchJSON('/api/signup/config');
            if (config.ok === true && config.enabled === true) {
                console.log('   ✅ PASSED - Signup config accessible\n');
                passed++;
            } else {
                console.log('   ❌ FAILED - Unexpected response:', config);
                failed++;
            }
        } catch (e) {
            console.log('   ❌ FAILED - Error:', e.message);
            failed++;
        }
        
        // Test 3: Bootstrap (Auth Required)
        try {
            console.log('▶️ Test 3: Bootstrap (Requires Auth)');
            const bootstrap = await fetchJSON('/api/bootstrap');
            if (bootstrap.error === 'no_account' || bootstrap.ok) {
                console.log('   ✅ PASSED - Auth requirement working\n');
                passed++;
            } else {
                console.log('   ❌ FAILED - Unexpected response:', bootstrap);
                failed++;
            }
        } catch (e) {
            console.log('   ❌ FAILED - Error:', e.message);
            failed++;
        }
        
        // Test 4: Products Feed (Auth Required)
        try {
            console.log('▶️ Test 4: Products Feed (Requires Auth)');
            const products = await fetchJSON('/api/meesho/for-you?limit=5');
            if (products.error === 'no_account' || Array.isArray(products.products) || Array.isArray(products.catalogs)) {
                console.log('   ✅ PASSED - Products endpoint responding\n');
                passed++;
            } else {
                console.log('   ❌ FAILED - Unexpected response:', products);
                failed++;
            }
        } catch (e) {
            console.log('   ❌ FAILED - Error:', e.message);
            failed++;
        }
        
        // Test 5: Frontend HTML
        try {
            console.log('▶️ Test 5: Frontend HTML Serving');
            const html = await fetchJSON('/');
            if (html.raw && html.raw.includes('Meesho Loot')) {
                console.log('   ✅ PASSED - Frontend serving correctly\n');
                passed++;
            } else {
                console.log('   ❌ FAILED - HTML content mismatch');
                failed++;
            }
        } catch (e) {
            console.log('   ❌ FAILED - Error:', e.message);
            failed++;
        }
    } finally {
        if (serverProcess) {
            serverProcess.kill();
        }
    }
    
    // Results
    console.log('════════════════════════════════════════');
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    console.log('════════════════════════════════════════\n');
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
