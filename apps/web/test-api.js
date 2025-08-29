// Quick API test script
async function testRegistration() {
  const testUser = {
    name: "Test User",
    email: "test@example.com",
    password: "TestPass123!"
  };

  try {
    const response = await fetch('http://localhost:3002/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const data = await response.json();
    console.log('Registration test result:', data);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test
testRegistration();
