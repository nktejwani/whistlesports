import axios from 'axios';

const BASE_URL = 'http://localhost:3000/auth/login';

async function test() {
  const data = {
    username: 'newuser' + Date.now(),
    password: 'test123'
  };

  // First, register
  try {
    const reg = await axios.post(`${BASE_URL.replace('/auth/login', '/users')}`, {
      username: data.username,
      password: data.password
    });
    console.log('Registered:', data.username);
  } catch (e) {
    console.error('Registration failed:', e.message);
  }

  // Then login
  try {
    const res = await axios.post(BASE_URL, data);
    console.log('\n=== LOGIN RESPONSE ===');  
    console.log('Status:', res.status);
    console.log('Raw data object keys:', Object.keys(res.data).slice(0, 3), '...');
    console.log('\nFull response.data:');
    console.log(JSON.stringify(res.data, null, 2).substring(0, 500));
    
    if (res.data.message) {
      console.log('\n✓ Message field found:', res.data.message);
    } else {
      console.log('\n✗ Message field NOT found');
      console.log('First 5 keys:', Object.keys(res.data).slice(0, 5));
    }
  } catch (e) {
    console.error('\nLogin failed:', e.message);
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', e.response.data);
    }
  }
}

test();
