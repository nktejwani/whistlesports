import axios from 'axios';

async function test() {
  try {
    // Create user
    const username = `user${Date.now()}`;
    const password = 'test123';
    
    const regRes = await axios.post('http://localhost:3000/users', {username, password});
    console.log('Registered:', regRes.data.username);
    
    // Login and process response carefully
    const loginRes = await axios.post('http://localhost:3000/auth/login', {username, password});
    
    console.log('\n=== RAW LOGIN RESPONSE OBJECT ===');
    console.log('typeof response.data:', typeof loginRes.data);
    console.log('response.data === safeUser:', Object.keys(loginRes.data).includes('message') ? 'NO' : 'YES (just user object)');
    
    // Check exact structure
    if (loginRes.data.message) {
      console.log('\n✓ SUCCESS: message field exists');
      console.log('message:', loginRes.data.message);
      console.log('user keys:', Object.keys(loginRes.data.user || {}).slice(0, 5));
    } else if (loginRes.data.user) {
      console.log('\n✗ FAIL: Has user field but no message');  
      console.log('Response has:', Object.keys(loginRes.data).slice(0, 5));
    } else {
      console.log('\n✗ FAIL: Response is just user object');
      console.log('Top keys:', Object.keys(loginRes.data).slice(0, 8));
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}

test();
