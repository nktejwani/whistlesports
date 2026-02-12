import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function test() {
  try {
    // 1. Register
    const username = `resettest${Date.now()}`;
    const originalPassword = 'original123';
    const newPassword = 'newpass456';
    
    console.log('1. Registering user:', username);
    const regRes = await axios.post(`${BASE_URL}/users`, {
      username,
      password: originalPassword
    });
    console.log('✓ User registered');
    
    // 2. Login with original password
    console.log('\n2. Logging in with original password');
    const login1 = await axios.post(`${BASE_URL}/auth/login`, {
      username,
      password: originalPassword
    });
    console.log('✓ Login successful with original password');
    
    // 3. Request password reset
    console.log('\n3. Requesting password reset');
    const resetRes = await axios.post(`${BASE_URL}/auth/forgot-password`, {
      username
    });
    const resetToken = resetRes.data.token;
    console.log('✓ Reset token:', resetToken.substring(0, 10) + '...');
    
    // 4. Reset password
    console.log('\n4. Resetting password with token');
    const resetPwRes = await axios.post(`${BASE_URL}/auth/reset-password/${resetToken}`, {
      password: newPassword
    });
    console.log('✓ Password reset response:', resetPwRes.data.message);
    
    // 5. Try to login with old password (should fail)
    console.log('\n5. Trying login with OLD password (should fail)');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        username,
        password: originalPassword
      });
      console.log('✗ Old password still works (BUG!)');
    } catch(e) {
      console.log('✓ Old password rejected:', e.response.status, e.response.data.error);
    }
    
    // 6. Login with new password
    console.log('\n6. Logging in with NEW password');
    try {
      const login2 = await axios.post(`${BASE_URL}/auth/login`, {
        username,
        password: newPassword
      });
      console.log('✓ Login successful with new password');
      console.log('Response has message?', !!login2.data.message);
    } catch(e) {
      console.log('✗ Login with new password FAILED');
      console.log('Status:', e.response.status);
      console.log('Error:', e.response.data);
    }
  } catch(e) {
    console.error('Test error:', e.message);
    if (e.response) {
      console.error('Response:', e.response.status, e.response.data);
    }
  }
}

test();
