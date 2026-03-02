-- Add credibility_breakdown JSONB column to final_student_results
-- Stores per-judge weighting details: { facultyId: { marks, weight, weighted_contribution } }
ALTER TABLE final_student_results
ADD COLUMN IF NOT EXISTS credibility_breakdown JSONB DEFAULT NULL;
