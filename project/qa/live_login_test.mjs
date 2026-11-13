// ---------------------------------------------------------------------------
// qa/live_login_test.mjs
// Real HTTP live integration test for TrustDrive Login API.
// ---------------------------------------------------------------------------
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

async function runLiveAuthTests() {
  console.log(`\n======================================================`);
  console.log(`RUNNING LIVE AUTHENTICATION TESTS AGAINST ${BASE}`);
  console.log(`======================================================\n`);

  async function postLogin(email, password) {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json().catch(() => null);
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    return { status: res.status, data: json, cookies };
  }

  // 1. Buyer Demo Login
  console.log("1. Testing Buyer Demo Login (aditya@trustdrive.dev / demo123456)...");
  const buyerRes = await postLogin("aditya@trustdrive.dev", "demo123456");
  console.log(`   Status: ${buyerRes.status}`);
  if (buyerRes.status === 200) {
    console.log(`   User: ${buyerRes.data.data.user.name} (${buyerRes.data.data.user.role})`);
    console.log(`   Session Token: ${buyerRes.data.data.sessionId}`);
    const tokenCookie = buyerRes.cookies.find(c => c.includes("td_token="));
    console.log(`   Session Cookie Set: ${Boolean(tokenCookie)}`);
  } else {
    console.log(`   Error: ${JSON.stringify(buyerRes.data)}`);
  }

  // 2. Seller Demo Login
  console.log("\n2. Testing Seller Demo Login (samarth@trustdrive.dev / demo123456)...");
  const sellerRes = await postLogin("samarth@trustdrive.dev", "demo123456");
  console.log(`   Status: ${sellerRes.status}`);
  if (sellerRes.status === 200) {
    console.log(`   User: ${sellerRes.data.data.user.name} (${sellerRes.data.data.user.role})`);
  } else {
    console.log(`   Error: ${JSON.stringify(sellerRes.data)}`);
  }

  // 3. Admin Demo Login
  console.log("\n3. Testing Admin Demo Login (admin@trustdrive.dev / demo123456)...");
  const adminRes = await postLogin("admin@trustdrive.dev", "demo123456");
  console.log(`   Status: ${adminRes.status}`);
  if (adminRes.status === 200) {
    console.log(`   User: ${adminRes.data.data.user.name} (${adminRes.data.data.user.role})`);
  } else {
    console.log(`   Error: ${JSON.stringify(adminRes.data)}`);
  }

  // 4. Case-sensitivity test: DEMO1234 uppercase
  console.log("\n4. Testing uppercase password DEMO1234 (should fail due to exact scrypt matching)...");
  const upperRes = await postLogin("aditya@trustdrive.dev", "DEMO1234");
  console.log(`   Status: ${upperRes.status} (Expected: 401)`);
  console.log(`   Message: ${upperRes.data?.error?.message}`);

  // 5. Wrong password test
  console.log("\n5. Testing wrong password...");
  const wrongRes = await postLogin("aditya@trustdrive.dev", "wrongpass");
  console.log(`   Status: ${wrongRes.status} (Expected: 401)`);
  console.log(`   Message: ${wrongRes.data?.error?.message}`);

  console.log("\n======================================================");
  console.log("LIVE AUTHENTICATION TEST SUITE FINISHED");
  console.log("======================================================\n");
}

runLiveAuthTests().catch(err => {
  console.error("Live test error:", err);
  process.exit(1);
});
