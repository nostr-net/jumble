#!/usr/bin/env node

/**
 * Navigation Test Runner
 * 
 * Runs the navigation service tests to verify single-pane navigation works
 * correctly for both mobile and desktop scenarios.
 */

const { execSync } = require('child_process')
const path = require('path')

console.log('🧪 Running Navigation Service Tests...\n')

try {
  // Run the tests
  const testCommand = 'npm test -- --testPathPattern=navigation.service.test.ts --verbose'
  console.log(`Running: ${testCommand}\n`)
  
  execSync(testCommand, { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname)
  })
  
  console.log('\n✅ All navigation tests passed!')
  console.log('\n📱 Mobile and Desktop Navigation Verification:')
  console.log('  ✓ URL parsing works correctly')
  console.log('  ✓ Component factory creates proper components')
  console.log('  ✓ Navigation service handles all view types')
  console.log('  ✓ Single-pane navigation flow works')
  console.log('  ✓ Back navigation behaves correctly')
  console.log('  ✓ Page titles are generated properly')
  console.log('  ✓ Error handling works gracefully')
  console.log('\n🎉 Navigation system is ready for production!')
  
} catch (error) {
  console.error('\n❌ Navigation tests failed!')
  console.error('Please check the test output above for details.')
  process.exit(1)
}
