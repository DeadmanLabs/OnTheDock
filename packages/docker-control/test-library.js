/**
 * Simple test script for OnTheDock library
 */

const { DockerControl } = require('./dist');

async function runTests() {
  console.log('🧪 Testing OnTheDock Library\n');
  
  const docker = new DockerControl();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: System Info
  try {
    console.log('📋 Test 1: Getting system info...');
    const info = await docker.system.info();
    console.log(`  ✅ Docker version: ${info.serverVersion}`);
    console.log(`  ✅ Containers: ${info.containers} (${info.containersRunning} running)`);
    console.log(`  ✅ Images: ${info.images}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 2: List Containers
  try {
    console.log('\n📋 Test 2: Listing containers...');
    const containers = await docker.containers.list(true);
    console.log(`  ✅ Found ${containers.length} containers`);
    if (containers.length > 0) {
      console.log(`  ✅ First container: ${containers[0].name} (${containers[0].state})`);
    }
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 3: List Images
  try {
    console.log('\n📋 Test 3: Listing images...');
    const images = await docker.images.list();
    console.log(`  ✅ Found ${images.length} images`);
    if (images.length > 0) {
      console.log(`  ✅ First image: ${images[0].tags[0] || 'untagged'}`);
    }
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 4: Get container logs (if containers exist)
  try {
    console.log('\n📋 Test 4: Getting container logs...');
    const containers = await docker.containers.list(true);
    if (containers.length > 0) {
      const logs = await docker.logs.get(containers[0].id, { tail: 5 });
      const logLines = logs.split('\n').filter(l => l.trim()).length;
      console.log(`  ✅ Retrieved ${logLines} log lines from ${containers[0].name}`);
      testsPassed++;
    } else {
      console.log('  ⏭️  Skipped: No containers found');
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 5: Get container stats (if running containers exist)
  try {
    console.log('\n📋 Test 5: Getting container stats...');
    const containers = await docker.containers.list(false); // Only running
    if (containers.length > 0) {
      const stats = await docker.stats.get(containers[0].id);
      console.log(`  ✅ CPU: ${stats.cpu.percent}%`);
      console.log(`  ✅ Memory: ${stats.memory.percent}%`);
      testsPassed++;
    } else {
      console.log('  ⏭️  Skipped: No running containers found');
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 6: Create and remove a test container
  try {
    console.log('\n📋 Test 6: Creating test container...');
    const containerId = await docker.containers.create({
      image: 'alpine:latest',
      name: 'onthedock-test-' + Date.now(),
      cmd: ['sleep', '10']
    });
    console.log(`  ✅ Created container: ${containerId}`);
    
    // Start it
    await docker.containers.start(containerId);
    console.log(`  ✅ Started container`);
    
    // Stop it
    await docker.containers.stop(containerId);
    console.log(`  ✅ Stopped container`);
    
    // Remove it
    await docker.containers.remove(containerId, true);
    console.log(`  ✅ Removed container`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Test 7: Shell detection
  try {
    console.log('\n📋 Test 7: Testing shell detection...');
    const containers = await docker.containers.list(false); // Only running
    if (containers.length > 0) {
      const shell = await docker.exec.findShell(containers[0].id);
      console.log(`  ✅ Found shell: ${shell} in ${containers[0].name}`);
      testsPassed++;
    } else {
      console.log('  ⏭️  Skipped: No running containers found');
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    testsFailed++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`  ✅ Passed: ${testsPassed}`);
  console.log(`  ❌ Failed: ${testsFailed}`);
  console.log('='.repeat(50));
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! The library is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
}

// Run tests
runTests().catch(console.error);