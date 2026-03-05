// Full audit test - verify all modules load correctly
const routes = [
  'authRoutes', 'userRoutes', 'personalizationRoutes', 'scarcityRoutes',
  'analyticsRoutes', 'projectEnhancementRoutes', 'gitRepoRoutes',
  'facultyEvaluationRoutes', 'peerRankingRoutes', 'comparativeRoutes',
  'zeroScoreRoutes', 'cohortRoutes', 'sessionPlannerRoutes',
  'facultyScopeRoutes', 'rubricRoutes', 'sessionReportRoutes',
  'appealsRoutes', 'alertsRoutes', 'adminManagementRoutes'
];

let errors = [];

routes.forEach(r => {
  try {
    require('./src/routes/' + r);
    console.log('OK: route/' + r);
  } catch(e) {
    console.error('FAIL: route/' + r + ' => ' + e.message);
    errors.push({module: 'route/' + r, error: e.message});
  }
});

// Test pemmRoutes (it exports a function, not a router)
try {
  const pemm = require('./src/routes/pemmRoutes');
  console.log('OK: route/pemmRoutes (type=' + typeof pemm.registerPEMMRoutes + ')');
} catch(e) {
  console.error('FAIL: route/pemmRoutes => ' + e.message);
  errors.push({module: 'route/pemmRoutes', error: e.message});
}

// Test all controllers
const controllers = [
  'adminManagementController', 'sessionPlannerController', 'sessionReportController',
  'alertsController', 'appealsController', 'credibilityController',
  'credibilityDashboardController'
];

controllers.forEach(c => {
  try {
    const mod = require('./src/controllers/' + c);
    const exports = Object.keys(mod);
    console.log('OK: ctrl/' + c + ' (' + exports.length + ' exports: ' + exports.join(', ') + ')');
  } catch(e) {
    console.error('FAIL: ctrl/' + c + ' => ' + e.message);
    errors.push({module: 'ctrl/' + c, error: e.message});
  }
});

// Test services
const services = ['CredibilityService', 'autoAssignmentService', 'anomalyDetectionService'];
services.forEach(s => {
  try {
    require('./src/services/' + s);
    console.log('OK: svc/' + s);
  } catch(e) {
    console.error('FAIL: svc/' + s + ' => ' + e.message);
    errors.push({module: 'svc/' + s, error: e.message});
  }
});

// Test socket
try {
  const socket = require('./src/socket');
  console.log('OK: socket (exports: ' + Object.keys(socket).join(', ') + ')');
  if (socket.EVENTS) {
    console.log('   EVENTS keys: ' + Object.keys(socket.EVENTS).join(', '));
  }
} catch(e) {
  console.error('FAIL: socket => ' + e.message);
  errors.push({module: 'socket', error: e.message});
}

// Test database
try {
  const db = require('./src/config/database');
  console.log('OK: database (exports: ' + Object.keys(db).join(', ') + ')');
} catch(e) {
  console.error('FAIL: database => ' + e.message);
  errors.push({module: 'database', error: e.message});
}

// Test middleware
try {
  const auth = require('./src/middleware/auth');
  console.log('OK: auth middleware (exports: ' + Object.keys(auth).join(', ') + ')');
} catch(e) {
  console.error('FAIL: auth middleware => ' + e.message);
  errors.push({module: 'auth', error: e.message});
}

// Test full app.js loads
try {
  require('./src/app');
  console.log('OK: app.js (full app loaded)');
} catch(e) {
  console.error('FAIL: app.js => ' + e.message);
  errors.push({module: 'app.js', error: e.message});
}

console.log('\n========== SUMMARY ==========');
if (errors.length === 0) {
  console.log('ALL MODULES LOADED SUCCESSFULLY - 0 errors');
} else {
  console.log(errors.length + ' ERRORS FOUND:');
  errors.forEach(e => console.log('  - ' + e.module + ': ' + e.error));
}
process.exit(errors.length > 0 ? 1 : 0);
