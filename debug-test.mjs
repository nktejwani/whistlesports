import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function test() {
  try {
    // Create a user
    const username = 'testraw' + Date.now();
    const password = 'testpass123';
    
    console.log('Creating user:', username);
    const regRes = await axios.post(`${BASE_URL}/users`, {
      username,
      password
    });
    console.log('Status:', regRes.status);
    console.log('Keys in response:', Object.keys(regRes.data));
    
    console.log('\nLogging in...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      username,
      password
    });
    console.log('Status:', loginRes.status);
    console.log('Keys in response:', Object.keys(loginRes.data));
    console.log('Has message?', 'message' in loginRes.data);
    console.log('Message value:', loginRes.data.message);
    console.log('Full response:', JSON.stringify(loginRes.data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
