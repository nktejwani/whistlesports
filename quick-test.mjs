import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function test() {
  try {
    // Test registration
    console.log('Testing registration...');
    const regRes = await axios.post(`${BASE_URL}/users`, {
      username: 'qtestuser' + Date.now(),
      password: 'test123'
    });
    console.log('Registration response:', JSON.stringify(regRes.data, null, 2));
    
    // Test login
    console.log('\nTesting login...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      username: regRes.data.username,
      password: 'test123'
    });
    console.log('Login response:', JSON.stringify(loginRes.data, null, 2));
    
    // Test duplicate username
    console.log('\nTesting duplicate username...');
    try {
      await axios.post(`${BASE_URL}/users`, {
        username: regRes.data.username,
        password: 'test456'
      });
    } catch (err) {
      console.log('Duplicate username error status:', err.response.status);
      console.log('Duplicate username error:', JSON.stringify(err.response.data, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    }
  }
}

test();
