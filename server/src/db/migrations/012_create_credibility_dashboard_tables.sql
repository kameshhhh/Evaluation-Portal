-- ============================================================
-- MIGRATION 012: Credibility Band Support (SRS-Compliant)
-- ============================================================
-- SRS 5.3: "Statistical dilution only, no explicit punishment"
-- SRS 7.2: "No raw ranking exposure, only bands"
--
-- Previous version had monitoring/alerting tables that violated
-- SRS principles. Replaced with band-only architecture.
--
-- Tables dropped:
--   - credibility_events      (audit trail = monitoring → SRS 5.3 violation)
--   - credibility_anomalies   (alerts/punishment → SRS 5.3 violation)
--   - dashboard_cache         (no dashboards to cache → unnecessary)
--   - evaluator_goals         (coaching → SRS 5.3: no improvement nudging)
--
-- No new tables needed — evaluator_credibility_profiles (from migration 010)
-- already contains everything required for band display.
-- ============================================================

-- Cleanup: Drop monitoring tables that violate SRS 5.3
DROP TABLE IF EXISTS credibility_events CASCADE;
DROP TABLE IF EXISTS credibility_anomalies CASCADE;
DROP TABLE IF EXISTS dashboard_cache CASCADE;
DROP TABLE IF EXISTS evaluator_goals CASCADE;
