const http = require('http');

async function testLogin(email, password) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ email, password });
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Login SUCCESS for ${email}`);
        } else {
          console.log(`❌ Login FAILED for ${email} (Status: ${res.statusCode}, Body: ${body})`);
        }
        resolve();
      });
    });
    
    req.on('error', error => {
      console.log(`❌ Network Error testing ${email}: ${error.message}`);
      resolve();
    });
    
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Testing logins through the backend API...\\n');
  await testLogin('admin@matha.school', 'Admin@1234');
  await testLogin('noel@matha.school', 'password123');
  await testLogin('priya.thomas@matha.school', 'password123');
}

run();
