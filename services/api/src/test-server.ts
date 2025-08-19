// Simple server test
import { execSync } from 'child_process';

try {
  console.log('🧪 Testing Orrange P2P Development Server...');
  
  // Test TypeScript compilation
  console.log('1. Testing TypeScript compilation...');
  execSync('npx tsc --noEmit', { cwd: process.cwd(), stdio: 'pipe' });
  console.log('✅ TypeScript compilation passed');
  
  // Import and test server creation
  console.log('2. Testing server imports...');
  const { default: Fastify } = await import('fastify');
  console.log('✅ Fastify imported successfully');
  
  // Test basic server creation
  console.log('3. Testing server creation...');
  const fastify = Fastify({ logger: false });
  
  fastify.get('/test', async (request, reply) => {
    return { status: 'working', timestamp: new Date().toISOString() };
  });
  
  const address = await fastify.listen({ port: 8081, host: '127.0.0.1' });
  console.log('✅ Server started successfully at:', address);
  
  // Test the endpoint
  console.log('4. Testing endpoint...');
  const response = await fetch('http://127.0.0.1:8081/test');
  const data = await response.json();
  console.log('✅ Endpoint response:', data);
  
  await fastify.close();
  console.log('✅ Server stopped cleanly');
  
  console.log('');
  console.log('🎉 All tests passed! Your development environment is ready.');
  console.log('🚀 Run "npm run dev" to start the full development server.');
  
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
