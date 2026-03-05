// Quick verification: do all credibility-related modules load?
const modules = [
  ['adminManagementController', './src/controllers/adminManagementController'],
  ['credibilityController', './src/controllers/credibilityController'],
  ['credibilityDashboardController', './src/controllers/credibilityDashboardController'],
  ['sessionPlannerController', './src/controllers/sessionPlannerController'],
  ['CredibilityService', './src/services/credibility/CredibilityService'],
  ['AlignmentAnalyzer', './src/services/credibility/analyzers/AlignmentAnalyzer'],
  ['DisciplineAnalyzer', './src/services/credibility/analyzers/DisciplineAnalyzer'],
  ['StabilityAnalyzer', './src/services/credibility/analyzers/StabilityAnalyzer'],
  ['PersonalizationService', './src/services/personalization/PersonalizationService'],
];
let ok = 0, fail = 0;
for (const [name, path] of modules) {
  try {
    const m = require(path);
    const keys = typeof m === 'function' ? [m.name || 'class'] : Object.keys(m);
    console.log('OK   ' + name + ': [' + keys.join(', ') + ']');                
    ok++;
  } catch(e) {
    console.log('FAIL ' + name + ': ' + e.message);
    fail++;                                                                           
  }
}
console.log('\n=== ' + ok + ' OK, ' + fail + ' FAILED ===');
process.exit(fail > 0 ? 1 : 0);
